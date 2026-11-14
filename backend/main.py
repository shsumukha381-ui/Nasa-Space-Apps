from fastapi import FastAPI

app = FastAPI(title="AstroTwin Hub")

@app.get("/")
def read_root():
    return {"status": "AstroTwin Server Offline-First Hub is Active", "system": "Nominal"}