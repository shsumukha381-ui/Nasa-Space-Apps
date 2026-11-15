import hashlib
import hmac
from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from settings import Role

bearer = HTTPBearer(auto_error=False, scheme_name="AstroTwin access key")


@dataclass(frozen=True)
class Principal:
    role: Role | Literal["demo"]

    @property
    def can_dispense(self) -> bool:
        return self.role in {"demo", "operator"}


def digest(value: str) -> bytes:
    return hashlib.sha256(value.encode("utf-8")).digest()


def current_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> Principal:
    if request.app.state.settings.demo:
        return Principal("demo")
    if credentials is not None and len(credentials.credentials) <= 256:
        candidate = digest(credentials.credentials)
        for role, expected in request.app.state.key_digests.items():
            if hmac.compare_digest(candidate, expected):
                return Principal(role)
    raise HTTPException(401, "A valid AstroTwin access key is required.", headers={"WWW-Authenticate": "Bearer"})


def allow(*roles: Role):
    def authorize(principal: Principal = Depends(current_principal)) -> Principal:
        if principal.role != "demo" and principal.role not in roles:
            raise HTTPException(403, "This access key does not have permission for that action.")
        return principal
    return authorize
