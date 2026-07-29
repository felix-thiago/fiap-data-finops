from dagster import job, op, get_dagster_logger
from pyspark.sql import SparkSession
from cost_engine import estimate_pipeline_cost

logger = get_dagster_logger()

@op
def pre_flight_check():
    """
    Etapa 1: Coleta a telemetria (volume) do dado e executa a Predição Prévia de Custos.
    """
    caminho_dados = "dados_exemplo.csv"
    
    # Aciona o motor de custos
    estimativa = estimate_pipeline_cost(caminho_dados)
    
    logger.info("==========================================================")
    logger.info("=== PRE-FLIGHT CHECK (PREDIÇÃO ANTECIPADA DE CUSTO) ===")
    logger.info(f"Volumetria identificada: {estimativa['file_size_gb']} GB")
    logger.info(f"Custo projetado AWS:   ${estimativa['aws_cost_usd']} USD")
    logger.info(f"Custo projetado Azure: ${estimativa['azure_cost_usd']} USD")
    logger.info(f"-> RECOMENDAÇÃO: Processar na {estimativa['recommended_cloud'].upper()}")
    logger.info(f"-> ECONOMIA ESTIMADA: ${estimativa['estimated_savings_usd']} USD")
    logger.info("==========================================================")
    
    return estimativa

@op
def process_data_pyspark(estimativa: dict):
    """
    Etapa 2: Executa a transformação em PySpark (Cross-Platform).
    """
    logger.info(f"Iniciando job PySpark na nuvem otimizada: {estimativa['recommended_cloud']}")
    
    # Inicializa a sessão local do Spark (simulando a infraestrutura agnóstica em container)
    spark = SparkSession.builder \
        .appName("CloudSwitch-FinOps-Pipeline") \
        .getOrCreate()
        
    # Exemplo de criação e transformação de dados agnóstica
    data = [("Vendas_SP", 1500), ("Vendas_RJ", 2300), ("Vendas_MG", 1100)]
    df = spark.createDataFrame(data, ["Regiao", "Valor"])
    
    # Operação de agregação
    resultado = df.groupBy("Regiao").sum("Valor")
    logger.info("Resultado do processamento PySpark concluído com sucesso:")
    resultado.show()
    
    spark.stop()
    return "Pipeline finalizado sem overspending!"

@job
def finops_pipeline():
    """
    Orquestração completa do pipeline FinOps.
    """
    estimativa = pre_flight_check()
    process_data_pyspark(estimativa)