# FitCheck — self-contained Python server (standard library only, no deps).
FROM python:3.11-slim

WORKDIR /app
COPY . /app

# Community outfits + the moderation key live on a mounted volume so they
# survive redeploys (the app dir itself is ephemeral on most hosts).
ENV FITCHECK_DATA_DIR=/data
VOLUME ["/data"]

# Hosts override $PORT; 8000 is the fallback for a plain `docker run`.
ENV PORT=8000
EXPOSE 8000

CMD ["python", "server.py"]
