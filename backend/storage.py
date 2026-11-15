"""Transactional storage shared by the API workers."""

from collections.abc import Iterator
from contextlib import contextmanager, nullcontext
from threading import RLock
from time import time
from typing import Any

from sqlalchemy import (
    JSON, BigInteger, CheckConstraint, Float, Integer, String, create_engine,
    func, select, text,
)
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

DEFAULT_ENVIRONMENT = {"co2": 1200.0, "radiation": 10.0, "days": 30.0, "sleep": 7.5}
STANDBY_VITALS = {"heart_rate": "--", "spo2": "--", "bp_sys": "--", "bp_dia": "--"}
SEED_ITEMS = (
    ("B-Vitamin Complex", 42, "Medical Locker A, Drawer 1", 5.0),
    ("Alendronate 10mg", 14, "Medical Locker B, Drawer 2", 10.0),
    ("Supplemental O2 Tanks", 8, "Life Support Bay 3", 0.0),
    ("LBNP Thigh Cuff Kit", 2, "Medical Locker C, Drawer 3", 0.0),
    ("Vitamin D 1000 IU", 100, "Medical Locker B, Drawer 1", 2.0),
)
SCHEMA_LOCK = 0x41535452
ROW_ID = BigInteger().with_variant(Integer, "sqlite")
Document = dict[str, Any]


class Base(DeclarativeBase):
    pass


class MedicalInventory(Base):
    """The table managed by earlier AstroTwin releases."""

    __tablename__ = "inventory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    medication: Mapped[str | None] = mapped_column(String, unique=True)
    quantity: Mapped[int | None] = mapped_column(Integer)
    location: Mapped[str | None] = mapped_column(String)
    potency_reduction_pct: Mapped[float | None] = mapped_column(Float)


class MissionState(Base):
    __tablename__ = "mission_state"
    __table_args__ = (CheckConstraint("id = 1", name="mission_state_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vitals: Mapped[Document] = mapped_column(JSON)
    environment: Mapped[Document] = mapped_column(JSON)
    telemetry_protocol: Mapped[Document | None] = mapped_column(JSON(none_as_null=True))
    environment_protocol: Mapped[Document | None] = mapped_column(JSON(none_as_null=True))
    last_protocol: Mapped[Document | None] = mapped_column(JSON(none_as_null=True))
    last_telemetry_at: Mapped[float | None] = mapped_column(Float)
    updated_at: Mapped[float] = mapped_column(Float)


class TelemetryRecord(Base):
    __tablename__ = "telemetry_records"

    id: Mapped[int] = mapped_column(ROW_ID, primary_key=True)
    received_at: Mapped[float] = mapped_column(Float)
    vitals: Mapped[Document] = mapped_column(JSON)
    actor: Mapped[str] = mapped_column(String(128))


class ProtocolRecord(Base):
    __tablename__ = "protocol_records"

    id: Mapped[int] = mapped_column(ROW_ID, primary_key=True)
    created_at: Mapped[float] = mapped_column(Float)
    protocol: Mapped[Document] = mapped_column(JSON)


class AuditRecord(Base):
    __tablename__ = "audit_records"

    id: Mapped[int] = mapped_column(ROW_ID, primary_key=True)
    created_at: Mapped[float] = mapped_column(Float)
    action: Mapped[str] = mapped_column(String(80))
    actor: Mapped[str] = mapped_column(String(128))
    details: Mapped[Document] = mapped_column(JSON)


class IdempotentResult(Base):
    __tablename__ = "idempotent_results"

    scope: Mapped[str] = mapped_column(String(80), primary_key=True)
    actor: Mapped[str] = mapped_column(String(128), primary_key=True)
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[Document] = mapped_column(JSON)
    created_at: Mapped[float] = mapped_column(Float)


class IdempotencyConflict(ValueError):
    pass


class InventoryMatchConflict(ValueError):
    pass


class InventoryOutOfStock(ValueError):
    pass


class Transaction:
    def __init__(self, session: Session, state: MissionState, *, write: bool):
        self._session = session
        self._write = write
        self.state = state

    def list_inventory(self) -> list[MedicalInventory]:
        rows = self._session.scalars(select(MedicalInventory).order_by(MedicalInventory.id))
        return [row for row in rows if row.medication and row.medication.strip()]

    def _matching_inventory(self, criterion: Any) -> MedicalInventory | None:
        query = select(MedicalInventory).where(criterion).order_by(MedicalInventory.id).limit(2)
        if self._write:
            query = query.with_for_update()
        rows = self._session.scalars(query).all()
        if len(rows) > 1:
            raise InventoryMatchConflict("Multiple inventory records match this name.")
        return rows[0] if rows else None

    def find_inventory(self, medication: str) -> MedicalInventory | None:
        name = medication.strip().lower()
        if not name:
            return None
        return self._matching_inventory(func.lower(func.trim(MedicalInventory.medication)) == name)

    def find_inventory_fragment(self, fragment: str) -> MedicalInventory | None:
        normalized = fragment.strip().lower()
        if not normalized:
            return None
        return self._matching_inventory(func.lower(MedicalInventory.medication).contains(normalized, autoescape=True))

    def create_inventory(
        self,
        medication: str,
        *,
        quantity: int,
        location: str,
        potency_reduction_pct: float,
    ) -> MedicalInventory:
        name = medication.strip()
        if self.find_inventory(name) is not None:
            raise InventoryMatchConflict("An inventory item already exists with this name.")
        item = MedicalInventory(medication=name)
        self.update_inventory(item, quantity=quantity, location=location, potency_reduction_pct=potency_reduction_pct)
        self._session.add(item)
        self._session.flush()
        return item

    def update_inventory(
        self,
        item: MedicalInventory,
        *,
        quantity: int | None = None,
        location: str | None = None,
        potency_reduction_pct: float | None = None,
    ) -> MedicalInventory:
        if quantity is not None:
            if quantity < 0:
                raise ValueError("Inventory quantity cannot be negative.")
            item.quantity = quantity
        if location is not None:
            item.location = location.strip()
        if potency_reduction_pct is not None:
            if not 0 <= potency_reduction_pct <= 100:
                raise ValueError("Inventory potency reduction must be between 0 and 100.")
            item.potency_reduction_pct = potency_reduction_pct
        return item

    def decrement_inventory(self, item: MedicalInventory) -> MedicalInventory:
        if item.quantity is None or item.quantity <= 0:
            raise InventoryOutOfStock("No units remain for this item.")
        item.quantity -= 1
        return item

    def set_environment(self, environment: Document) -> None:
        self.state.environment = dict(environment)
        self.state.updated_at = time()

    def record_telemetry(
        self, payload: Document, actor: str, *, received_at: float | None = None, apply: bool = True,
    ) -> int:
        received_at = time() if received_at is None else received_at
        vitals = dict(payload)
        record = TelemetryRecord(received_at=received_at, vitals=vitals, actor=actor)
        self._session.add(record)
        if apply:
            self.state.vitals = vitals
            self.state.last_telemetry_at = received_at
            self.state.updated_at = received_at
        self._session.flush()
        return record.id

    def new_protocol(self, protocol_dict: Document) -> Document:
        record = ProtocolRecord(created_at=time(), protocol=protocol_dict)
        self._session.add(record)
        self._session.flush()
        protocol = {**protocol_dict, "id": record.id, "created_at": record.created_at}
        record.protocol = protocol
        self.state.last_protocol = protocol
        self.state.updated_at = record.created_at
        return protocol

    def audit(self, action: str, actor: str, details: Document | None = None) -> None:
        self._session.add(AuditRecord(created_at=time(), action=action, actor=actor, details=details or {}))

    def get_idempotent_result(self, scope: str, actor: str, key: str, payload_hash: str) -> Document | None:
        record = self._session.get(IdempotentResult, (scope, actor, key))
        if record is None:
            return None
        if record.payload_hash != payload_hash:
            raise IdempotencyConflict("This idempotency key already belongs to a different request.")
        return record.response

    def save_idempotent_result(
        self, scope: str, actor: str, key: str, payload_hash: str, response: Document,
    ) -> None:
        self._session.add(
            IdempotentResult(scope=scope, actor=actor, key=key, payload_hash=payload_hash,
                             response=response, created_at=time()),
        )

    def _history(self, model: type, limit: int, before_id: int | None):
        query = select(model).order_by(model.id.desc()).limit(max(1, min(limit, 500)))
        if before_id is not None:
            query = query.where(model.id < before_id)
        return self._session.scalars(query)

    def telemetry_history(self, limit: int, before_id: int | None = None) -> list[Document]:
        return [
            {"id": record.id, "received_at": record.received_at, "observed_at": record.vitals.get("observed_at"), "vitals": record.vitals}
            for record in self._history(TelemetryRecord, limit, before_id)
        ]

    def latest_telemetry_id(self) -> int | None:
        return self._session.scalar(select(TelemetryRecord.id).order_by(TelemetryRecord.id.desc()).limit(1))

    def protocol_history(self, limit: int, before_id: int | None = None) -> list[Document]:
        return [record.protocol for record in self._history(ProtocolRecord, limit, before_id)]

    def audit_history(self, limit: int, before_id: int | None = None) -> list[Document]:
        return [
            {"id": record.id, "created_at": record.created_at, "action": record.action,
             "actor": record.actor, "details": record.details}
            for record in self._history(AuditRecord, limit, before_id)
        ]


class Storage:
    def __init__(self, database_url: str | URL):
        url = make_url(database_url)
        self._is_sqlite = url.get_backend_name() == "sqlite"
        memory = self._is_sqlite and url.database in {None, "", ":memory:"}
        self._memory_lock = RLock() if memory else None
        engine_options: dict[str, Any] = {"pool_pre_ping": True, "hide_parameters": True}
        if self._is_sqlite:
            engine_options["connect_args"] = {"check_same_thread": False, "timeout": 10}
        if url.get_backend_name() == "postgresql" and "connect_timeout" not in url.query:
            engine_options["connect_args"] = {"connect_timeout": 5}
        if memory:
            engine_options["poolclass"] = StaticPool
        self._engine = create_engine(url, **engine_options)
        self._sessions = sessionmaker(self._engine)

    @contextmanager
    def _session(self, *, write: bool) -> Iterator[Session]:
        lock = self._memory_lock if self._memory_lock is not None else nullcontext()
        with lock, self._sessions() as session:
            if self._is_sqlite:
                session.connection().exec_driver_sql("BEGIN IMMEDIATE" if write else "BEGIN")
            elif not write:
                session.connection(execution_options={"isolation_level": "REPEATABLE READ"})
            yield session
            if write:
                session.commit()

    def initialize(self, seed_inventory: bool = True) -> None:
        """Apply the initial additive schema and preserve all existing inventory rows."""
        with self._session(write=True) as session:
            connection = session.connection()
            if connection.dialect.name == "postgresql":
                connection.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": SCHEMA_LOCK})
            Base.metadata.create_all(connection)
            if session.get(MissionState, 1) is None:
                session.add(MissionState(id=1, vitals=STANDBY_VITALS.copy(), environment=DEFAULT_ENVIRONMENT.copy(),
                                         updated_at=time()))
            if seed_inventory:
                existing = {name.lower() for name in session.scalars(select(MedicalInventory.medication)) if name}
                session.add_all(
                    MedicalInventory(medication=name, quantity=quantity, location=location, potency_reduction_pct=loss)
                    for name, quantity, location, loss in SEED_ITEMS
                    if name.lower() not in existing
                )

    def ping(self) -> None:
        with self._session(write=False) as session:
            session.execute(select(MissionState.id).where(MissionState.id == 1)).scalar_one()

    def dispose(self) -> None:
        self._engine.dispose()

    @contextmanager
    def read(self) -> Iterator[Transaction]:
        with self._session(write=False) as session:
            state = session.execute(select(MissionState).where(MissionState.id == 1)).scalar_one()
            yield Transaction(session, state, write=False)

    @contextmanager
    def write(self) -> Iterator[Transaction]:
        with self._session(write=True) as session:
            # All writers lock the mission first, so related updates commit in one order across workers.
            state = session.execute(select(MissionState).where(MissionState.id == 1).with_for_update()).scalar_one()
            yield Transaction(session, state, write=True)
