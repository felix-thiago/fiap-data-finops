-- Calibração do throughput dos warehouses Snowflake (XS, S, M) no trial gratuito.
-- Usa a tabela LINEITEM do TPC-H que já vem no banco de exemplo (SNOWFLAKE_SAMPLE_DATA),
-- então não é preciso carregar dado nenhum. Custo estimado: poucos créditos do trial.
-- Passo a passo e como registrar o resultado: calibration/README.md, seção "Sem conta AWS".

-- 0. preparação (uma vez)
CREATE DATABASE IF NOT EXISTS BENCH;
USE DATABASE BENCH;
USE SCHEMA PUBLIC;
-- se o banco de exemplo não aparecer na conta:
-- CREATE DATABASE SNOWFLAKE_SAMPLE_DATA FROM SHARE SFC_SAMPLES.SAMPLE_DATA;
CREATE WAREHOUSE IF NOT EXISTS BENCH_WH WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 INITIALLY_SUSPENDED = TRUE;
USE WAREHOUSE BENCH_WH;
ALTER SESSION SET USE_CACHED_RESULT = FALSE;     -- não reaproveitar resultado de execução anterior
ALTER SESSION SET QUERY_TAG = 'datacost-bench';

-- 1. a transformação medida: a mesma do etl_benchmark.py (dedup + colunas derivadas),
--    lendo ~600 milhões de linhas (TPC-H scale factor 100)
--    Rode o bloco abaixo 2 vezes para cada tamanho: XSMALL, SMALL e MEDIUM.
ALTER WAREHOUSE BENCH_WH SUSPEND;                -- começa "frio", sem cache local do warehouse
ALTER WAREHOUSE BENCH_WH SET WAREHOUSE_SIZE = 'XSMALL';   -- troque para SMALL e depois MEDIUM
CREATE OR REPLACE TRANSIENT TABLE BENCH_SILVER AS
SELECT DISTINCT
    L_ORDERKEY, L_LINENUMBER, L_PARTKEY, L_SUPPKEY, L_QUANTITY,
    L_EXTENDEDPRICE, ROUND(L_EXTENDEDPRICE * 5.4, 2) AS AMOUNT_BRL,
    L_DISCOUNT, L_TAX, L_RETURNFLAG, L_LINESTATUS, L_SHIPDATE AS DAY, L_SHIPMODE
FROM SNOWFLAKE_SAMPLE_DATA.TPCH_SF100.LINEITEM;

-- 2. resultado: uma linha por execução, já no formato de calibration/measurements.csv
--    gb_processed = volume lógico da LINEITEM no SF100 (~0,71 GB por unidade de scale factor
--    no arquivo texto do TPC-H, ou seja ~71 GB); bytes escaneados (comprimidos) vão nas notas.
SELECT
    'snowflake_wh'                                        AS engine,
    1                                                     AS workers,
    ''                                                    AS worker_type,
    CASE UPPER(REPLACE(WAREHOUSE_SIZE, '-', '')) WHEN 'XSMALL' THEN 'XS' WHEN 'SMALL' THEN 'S'
         WHEN 'MEDIUM' THEN 'M' WHEN 'LARGE' THEN 'L' END     AS wh_size,
    71                                                    AS gb_processed,
    ROUND(TOTAL_ELAPSED_TIME / 60000, 2)                  AS duration_min,
    ROUND((QUEUED_PROVISIONING_TIME + COMPILATION_TIME) / 60000, 2) AS startup_min,
    'trial ' || TO_VARCHAR(START_TIME, 'YYYY-MM-DD') || ' TPCH_SF100 bytes_scanned_gb='
        || ROUND(BYTES_SCANNED / POWER(1024, 3), 2)       AS notes
FROM TABLE(INFORMATION_SCHEMA.QUERY_HISTORY(RESULT_LIMIT => 200))
WHERE QUERY_TAG = 'datacost-bench'
  AND UPPER(QUERY_TYPE) = 'CREATE_TABLE_AS_SELECT'
  AND UPPER(EXECUTION_STATUS) = 'SUCCESS'
ORDER BY START_TIME;

-- 3. limpeza
-- DROP TABLE BENCH_SILVER; DROP WAREHOUSE BENCH_WH; DROP DATABASE BENCH;
