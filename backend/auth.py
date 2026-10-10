import os, json, secrets
from dataclasses import dataclass
from fastapi import HTTPException, Request
import jwt
from functools import lru_cache
from backend.domain import descendants


@dataclass
class Principal:
    id: str
    role: str
    unit: str | None = None

    @property
    def finance(self):
        return self.role in {"admin", "finance"}

    @property
    def editor(self):
        return self.role in {"admin", "finance", "owner"}


DEV_ROLES = {
    "admin": Principal("demo-admin", "admin"),
    "finance": Principal("demo-finance", "finance"),
    "owner": Principal("demo-engineering-owner", "owner", "eng"),
    "viewer": Principal("demo-viewer", "viewer"),
}
MODE = os.getenv("AUTH_MODE", "development")
DEV_SECRET = secrets.token_urlsafe(48)


@lru_cache(maxsize=4)
def signing_keys(tenant):
    return jwt.PyJWKClient(
        f"https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys"
    )


def validate_config():
    if MODE not in {"development", "entra"}:
        raise RuntimeError("AUTH_MODE must be development or entra")
    if os.getenv("APP_ENV") == "production" and MODE != "entra":
        raise RuntimeError(
            "Production requires AUTH_MODE=entra; development role switching is disabled"
        )
    if MODE == "entra" and not all(
        os.getenv(k)
        for k in [
            "ENTRA_TENANT_ID",
            "ENTRA_AUDIENCE",
            "ENTRA_ACCESS_MAP",
            "ENTRA_CLIENT_ID",
            "ENTRA_SCOPE",
        ]
    ):
        raise RuntimeError(
            "Entra tenant, audience, client ID, API scope and explicit access map are required"
        )


def principal(request: Request):
    if MODE == "development":
        token = request.cookies.get("divergent_session")
        role = "admin"
        if token:
            try:
                role = jwt.decode(token, DEV_SECRET, algorithms=["HS256"])["role"]
            except jwt.InvalidTokenError:
                role = "viewer"
        return DEV_ROLES.get(role, DEV_ROLES["viewer"])
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        raise HTTPException(401, "Sign in through the company Entra integration")
    tenant = os.environ["ENTRA_TENANT_ID"]
    issuer = f"https://login.microsoftonline.com/{tenant}/v2.0"
    try:
        key = signing_keys(tenant).get_signing_key_from_jwt(token[7:])
        claims = jwt.decode(
            token[7:],
            key.key,
            algorithms=["RS256"],
            audience=os.environ["ENTRA_AUDIENCE"],
            issuer=issuer,
            options={"require": ["exp", "iat", "iss", "aud", "oid"]},
        )
        if (
            os.environ["ENTRA_SCOPE"].rsplit("/", 1)[-1]
            not in claims.get("scp", "").split()
        ):
            raise ValueError("Required delegated API scope is missing")
        binding = json.loads(os.environ["ENTRA_ACCESS_MAP"]).get(claims["oid"])
        if not binding or binding.get("role") not in DEV_ROLES:
            raise ValueError("No assigned application access")
        if binding["role"] == "owner" and not binding.get("unit"):
            raise ValueError("Owner requires explicit unit scope")
        return Principal(claims["oid"], binding["role"], binding.get("unit"))
    except Exception:
        raise HTTPException(401, "Token invalid or application access not assigned")


def visible_units(state, p):
    return (
        descendants(state["OrganizationalUnits"], "ParentOrgUnitID", p.unit)
        if p.role == "owner"
        else set(state["OrganizationalUnits"])
    )


def require_admin(p):
    if p.role != "admin":
        raise HTTPException(403, "Administrator access required")


def require_editor(p):
    if not p.editor:
        raise HTTPException(403, "Planning access required")
