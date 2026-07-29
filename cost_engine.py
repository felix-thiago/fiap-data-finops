import os

# Tabela estática simulando as APIs de Preços (Pricing APIs) das nuvens
CLOUD_PRICES = {
    "AWS": {
        "compute_per_gb": 0.08,  # USD por GB processado na AWS
        "storage_per_gb": 0.023
    },
    "Azure": {
        "compute_per_gb": 0.065, # USD por GB processado na Azure (mais em conta neste cenário)
        "storage_per_gb": 0.018
    }
}

def estimate_pipeline_cost(file_path: str) -> dict:
    """
    Avalia o volume do arquivo antes da execução (Pre-run Prediction) 
    e calcula o custo estimado em cada provedor de nuvem.
    """
    if os.path.exists(file_path):
        size_in_bytes = os.path.getsize(file_path)
    else:
        # Tamanho simulado padrão (ex: 5.5 GB) caso o arquivo de teste não exista no disco
        size_in_bytes = 5.5 * 1024 * 1024 * 1024

    size_in_gb = size_in_bytes / (1024 ** 3)
    
    # Cálculo proporcional simples
    aws_cost = size_in_gb * CLOUD_PRICES["AWS"]["compute_per_gb"]
    azure_cost = size_in_gb * CLOUD_PRICES["Azure"]["compute_per_gb"]
    
    recommended_cloud = "Azure" if azure_cost < aws_cost else "AWS"
    savings = abs(aws_cost - azure_cost)
    
    return {
        "file_size_gb": round(size_in_gb, 3),
        "aws_cost_usd": round(aws_cost, 4),
        "azure_cost_usd": round(azure_cost, 4),
        "recommended_cloud": recommended_cloud,
        "estimated_savings_usd": round(savings, 4)
    }

if __name__ == "__main__":
    # Teste rápido direto no terminal
    res = estimate_pipeline_cost("dados_exemplo.csv")
    print("--- Teste do Motor de Custos ---")
    print(f"Tamanho do arquivo: {res['file_size_gb']} GB")
    print(f"Custo AWS: ${res['aws_cost_usd']}")
    print(f"Custo Azure: ${res['azure_cost_usd']}")
    print(f"Recomendação: Executar na {res['recommended_cloud']} (Economia: ${res['estimated_savings_usd']})")