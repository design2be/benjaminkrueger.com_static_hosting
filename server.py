from fastapi import FastAPI, Request

from fastapi.staticfiles import StaticFiles
from pathlib import Path
import uvicorn

app = FastAPI()

port = 8080
BASE_DIR = Path(__file__).parent

@app.get("/api/health")
def health(request: Request):
    return {"status": "ok", "port": port}

app.mount("/", StaticFiles(directory=str(BASE_DIR), html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=port)
