FROM python:3.9-slim

# Instala o Java (necessário para o PySpark)
RUN apt-get update && \
    apt-get install -y default-jre-headless && \
    apt-get clean

# Define a pasta de trabalho dentro do container
WORKDIR /opt/dagster/app

# Copia e instala as bibliotecas do requirements.txt
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia todo o código da sua aplicação para o container
COPY . .

# Expõe a porta 3000 para a interface web do Dagster
EXPOSE 3000

# Comando de inicialização do painel do Dagster
CMD ["dagster-webserver", "-h", "0.0.0.0", "-p", "3000"]