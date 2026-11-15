import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from sqlalchemy import create_engine, func, insert, select
from sqlalchemy.engine import URL, make_url
from sqlalchemy.schema import CreateSchema, DropSchema

from storage import (
    IdempotencyConflict, InventoryMatchConflict, InventoryOutOfStock,
    MedicalInventory, Storage,
)

SUPPLY = "Supplemental O2 Tanks"
READING = {"heart_rate": 73, "spo2": 98, "bp_sys": 118, "bp_dia": 76}


class StorageTests(unittest.TestCase):
    def test_sqlite_persistence_and_competing_dispenses(self):
        with TemporaryDirectory() as temporary:
            database = URL.create("sqlite", database=str(Path(temporary, "test.sqlite3")))
            self._check_storage(database)

    @unittest.skipUnless(os.getenv("ASTROTWIN_TEST_POSTGRES_URL"), "Set ASTROTWIN_TEST_POSTGRES_URL for PostgreSQL tests")
    def test_postgresql_persistence_and_competing_dispenses(self):
        url = make_url(os.environ["ASTROTWIN_TEST_POSTGRES_URL"])
        schema = f"astrotwin_test_{uuid4().hex}"
        engine = create_engine(url, hide_parameters=True)
        try:
            with engine.begin() as connection:
                connection.execute(CreateSchema(schema))
            try:
                options = url.query.get("options", "")
                database = url.update_query_dict({"options": f"{options} -csearch_path={schema}".strip()})
                self._check_storage(database)
            finally:
                with engine.begin() as connection:
                    connection.execute(DropSchema(schema, cascade=True))
        finally:
            engine.dispose()

    def test_initializes_without_sample_inventory(self):
        storage = Storage("sqlite://")
        try:
            storage.initialize(seed_inventory=False)
            storage.ping()
            with storage.read() as transaction:
                self.assertEqual(transaction.list_inventory(), [])
        finally:
            storage.dispose()

    def _check_storage(self, database: URL):
        legacy = create_engine(database, hide_parameters=True)
        try:
            with legacy.begin() as connection:
                MedicalInventory.__table__.create(connection)
                connection.execute(insert(MedicalInventory), [
                    {"medication": SUPPLY, "quantity": 3, "location": "Legacy locker", "potency_reduction_pct": 0},
                    {"medication": None, "quantity": None, "location": None, "potency_reduction_pct": None},
                    {"medication": " \t ", "quantity": None, "location": None, "potency_reduction_pct": None},
                ])
            storage = Storage(database)
            other_worker = Storage(database)
            try:
                with ThreadPoolExecutor(max_workers=2) as executor:
                    initializations = [executor.submit(worker.initialize) for worker in (storage, other_worker)]
                    for initialization in initializations:
                        initialization.result()
                self._check_legacy_inventory(legacy, storage)
                first, second, protocol = self._write_telemetry(storage, other_worker, database)
                self._compete_for_inventory(storage, other_worker)
            finally:
                storage.dispose()
                other_worker.dispose()
        finally:
            legacy.dispose()

        reopened = Storage(database)
        try:
            reopened.initialize()
            reopened.ping()
            with reopened.read() as transaction:
                self.assertEqual(transaction.find_inventory(SUPPLY.lower()).quantity, 0)
                self.assertEqual(transaction.state.telemetry_protocol, protocol)
                self.assertEqual(transaction.state.last_protocol, protocol)
                self.assertEqual(transaction.state.environment["co2"], 4200)
                self.assertEqual([record["id"] for record in transaction.telemetry_history(1)], [second])
                previous = transaction.telemetry_history(1, before_id=second)
                self.assertEqual([record["id"] for record in previous], [first])
                self.assertEqual(transaction.protocol_history(1), [protocol])
                audit = transaction.audit_history(10)
                self.assertEqual([record["action"] for record in audit], ["dispense"] * 3)
        finally:
            reopened.dispose()

    def _check_legacy_inventory(self, legacy, storage):
        with legacy.connect() as connection:
            count = connection.execute(select(func.count()).select_from(MedicalInventory)).scalar_one()
            self.assertEqual(count, 7)
        with storage.read() as transaction:
            self.assertEqual(len(transaction.list_inventory()), 5)
            supply = transaction.find_inventory(SUPPLY)
            self.assertEqual((supply.quantity, supply.location), (3, "Legacy locker"))
            self.assertIsNone(transaction.find_inventory_fragment("%"))
            with self.assertRaises(InventoryMatchConflict):
                transaction.find_inventory_fragment("vitamin")

    def _write_telemetry(self, storage, other_worker, database):
        with storage.write() as transaction:
            first = transaction.record_telemetry(READING, "sensor")
            protocol = transaction.new_protocol({"severity": "WARNING"})
            transaction.state.telemetry_protocol = protocol

        def next_reading():
            with other_worker.write() as transaction:
                reading = transaction.record_telemetry({**READING, "heart_rate": 75}, "sensor")
                transaction.set_environment({**transaction.state.environment, "co2": 4200})
                return reading

        if database.get_backend_name() == "postgresql":
            with storage.read() as transaction:
                self.assertEqual(transaction.state.vitals["heart_rate"], 73)
                second = next_reading()
                history = transaction.telemetry_history(1)
                self.assertEqual(history[0]["id"], first)
        else:
            second = next_reading()
        return first, second, protocol

    def _compete_for_inventory(self, storage, other_worker):
        with self.assertRaisesRegex(RuntimeError, "rollback"):
            with storage.write() as transaction:
                transaction.decrement_inventory(transaction.find_inventory(SUPPLY))
                transaction.audit("rolled_back", "operator")
                raise RuntimeError("rollback")

        digest = sha256(SUPPLY.encode()).hexdigest()
        with storage.write() as transaction:
            transaction.decrement_inventory(transaction.find_inventory(SUPPLY))
            transaction.audit("dispense", "operator", {"item": SUPPLY})
            transaction.save_idempotent_result("dispense", "operator", "sample", digest, {"ok": True})
        with other_worker.write() as transaction:
            replay = transaction.get_idempotent_result("dispense", "operator", "sample", digest)
            self.assertEqual(replay, {"ok": True})
            with self.assertRaises(IdempotencyConflict):
                transaction.get_idempotent_result("dispense", "operator", "sample", "different")

        def dispense(index):
            worker = other_worker if index % 2 else storage
            try:
                with worker.write() as transaction:
                    transaction.decrement_inventory(transaction.find_inventory(SUPPLY))
                    transaction.audit("dispense", "operator", {"item": SUPPLY})
                return True
            except InventoryOutOfStock:
                return False

        with ThreadPoolExecutor(max_workers=8) as executor:
            self.assertEqual(sum(executor.map(dispense, range(16))), 2)
