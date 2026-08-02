FROM python:3.12-slim

# tesseract-ocr: OS-level engine pytesseract wraps (advisory OCR — see main/ocr.py).
# The image works without it; OCR just quietly returns no results (by design).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x docker-entrypoint.sh

# Placeholder values only — real values come from the environment at `docker run`/
# compose time. Needed here only so collectstatic (which touches settings.py, and
# therefore SECRET_KEY) can run without a real production secret at build time.
ENV DJANGO_SECRET_KEY=build-time-placeholder-not-used-at-runtime \
    DJANGO_DEBUG=False
RUN python manage.py collectstatic --noinput

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["gunicorn", "myproject.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "30"]
