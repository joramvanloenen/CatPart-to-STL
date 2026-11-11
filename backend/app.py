"""Optional licensed CATIA converter API adapter.

This API does not decode CATPart directly. Install a licensed native translator
and configure CATPART_CONVERT_COMMAND with its trusted command-line interface.
Do not expose an unauthenticated converter to the public internet.
"""
from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

app = FastAPI(title="CATPart-to-STL adapter", docs_url=None, redoc_url=None)
origins = [s.strip() for s in os.getenv("ALLOWED_ORIGINS", "http://localhost:8000").split(",") if s.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["POST"], allow_headers=["*"])

MAX_BYTES = int(os.getenv("MAX_FILE_BYTES", str(100 * 1024 * 1024)))
CONVERT_COMMAND = os.getenv("CATPART_CONVERT_COMMAND", "")
TIMEOUT = int(os.getenv("CONVERTER_TIMEOUT_SECONDS", "180"))


@app.get("/health")
def health():
    return {"converter_configured": bool(CONVERT_COMMAND)}


def validate_stl(file_path: Path) -> None:
    data = file_path.read_bytes()
    if len(data) >= 84:
        facets = int.from_bytes(data[80:84], "little")
        if facets > 0 and len(data) == 84 + 50 * facets:
            return
    # Some licensed tools emit ASCII instead of binary STL.
    lower = data.lower().strip()
    if lower.startswith(b"solid") and b"facet normal" in lower and b"endfacet" in lower:
        return
    raise HTTPException(status_code=502, detail="Native converter produced no valid STL triangles")


@app.post("/convert")
async def convert(file: UploadFile = File(...)):
    if not CONVERT_COMMAND:
        raise HTTPException(status_code=503, detail="No licensed CATIA converter installed or configured")
    if not file.filename or Path(file.filename).suffix.lower() != ".catpart":
        raise HTTPException(status_code=415, detail="A CATPart file is required")
    tmp = Path(tempfile.mkdtemp(prefix="catpart-"))
    try:
        input_path = tmp / "source.CATPart"
        output_path = tmp / "model.stl"
        size = 0
        with input_path.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status_code=413, detail="Upload is too large")
                output.write(chunk)
        with input_path.open("rb") as f:
            if f.read(8) != b"V5_CFV2\x00":
                raise HTTPException(status_code=422, detail="Invalid CATIA V5 container")
        if "{input}" not in CONVERT_COMMAND or "{output}" not in CONVERT_COMMAND:
            raise HTTPException(status_code=503, detail="Command template must include {input} and {output}")
        # Trusted operator-provided command template only; shell invocation disabled.
        args = [
            segment.replace("{input}", str(input_path)).replace("{output}", str(output_path))
            for segment in shlex.split(CONVERT_COMMAND)
        ]
        if not args:
            raise HTTPException(status_code=503, detail="Converter command is empty")
        try:
            result = subprocess.run(args, cwd=tmp, capture_output=True, text=True, timeout=TIMEOUT, shell=False)
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Native translator timed out")
        except OSError as error:
            raise HTTPException(status_code=503, detail="Converter failed to start: " + str(error))
        if result.returncode != 0 or not output_path.is_file():
            raise HTTPException(status_code=502, detail="Native translator failed. Check server logs and licensing.")
        validate_stl(output_path)
        return FileResponse(
            output_path, media_type="model/stl",
            filename=Path(file.filename).stem + ".stl",
            background=BackgroundTask(shutil.rmtree, tmp, ignore_errors=True),
        )
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
