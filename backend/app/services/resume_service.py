import io
import os
import uuid
import fitz  # PyMuPDF
from docx import Document
from fastapi import UploadFile
from app.core.config import get_settings

settings = get_settings()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def extract_text(file: UploadFile) -> str:
    """从上传文件中提取文本"""
    ext = os.path.splitext(file.filename or "")[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的文件格式: {ext}，仅支持 PDF、DOCX、TXT")

    content = file.file.read()

    if ext == ".txt":
        return content.decode("utf-8", errors="ignore")
    elif ext == ".pdf":
        return _extract_pdf(content)
    elif ext == ".docx":
        return _extract_docx(content)

    return ""


def _extract_pdf(content: bytes) -> str:
    doc = fitz.open(stream=content, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    return text


def _extract_docx(content: bytes) -> str:
    doc = Document(io.BytesIO(content))
    return "\n".join([p.text for p in doc.paragraphs if p.text.strip()])


def save_upload(file: UploadFile, guest_session_id: str | None = None) -> tuple[str, str]:
    """保存上传文件，返回 (文件路径, 原始文件名)"""
    os.makedirs(settings.upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.upload_dir, filename)

    file.file.seek(0)
    with open(filepath, "wb") as f:
        f.write(file.file.read())

    return filepath, file.filename or filename