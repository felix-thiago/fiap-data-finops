FROM python:3.9-slim

RUN apt-get update && \
    apt-get install -y default-jre-headless && \
    apt-get clean

WORKDIR /opt/dagster/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3000

# Adicionado o parâmetro -f pipeline.py ao final
CMD ["dagster", "dev", "-h", "0.0.0.0", "-p", "3000", "-f", "pipeline.py"]