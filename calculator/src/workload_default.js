// o workload padrão (o cenário do enunciado), compartilhado entre a visão técnica
// (app.js) e a gerencial (executive.js) pra garantir que as duas nunca partam de
// premissas diferentes. não depende de nada — quem consome isso é o engine.js
// (ENGINES) via calcPipeline.

// workload global
const G_DEFAULTS = {
  name:'Oracle → Lakehouse → Snowflake', environment:'Production', criticality:'High',
  sourceType:'Oracle', sourceVolumeGB:4096, dailyDeltaGB:120, recordsPerDay:60_000_000,
  ingestion:'incremental',
  targetFileMB:128, catalogObjects:50000,
  queriesPerDay:300, avgQuerySec:25, scanPerQueryGB:3,
  failureRate:2, retries:2,
  crossRegionGB:0, internetGB:0, discountPct:0,
  budgetMonthly:2500, slaMaxMinutes:360, freshnessHours:30, orchestration:'chained',
  snowflakeEdition:'standard', snowflakeStorage:'capacity', dwStorage:true,
  customGbPerNodeMin:0.5, customCostPerNodeHour:0.30,
  _provided:{ targetFileMB:1, failureRate:1, retries:1, queriesPerDay:1, recordsPerDay:1,
              catalogObjects:1, scanPerQueryGB:1, avgQuerySec:1 },
};

// pipeline padrão — o cenário do enunciado
const STAGE_DEFAULTS = () => ([
  { key:'raw',    name:'Ingestion → Raw',  kind:'ingest',    enabled:true, engine:'glue',
    workers:4, workerType:'m5.xlarge', runsPerDay:1, reduction:1.00,
    fileFormat:'parquet-snappy', tableFormat:'hive', retentionDays:365, storageClass:'standard',
    maintenanceRunsPerMonth:0, whSize:'S', autoSuspendSec:60 },
  { key:'bronze', name:'Bronze',           kind:'transform', enabled:true, engine:'glue',
    workers:4, workerType:'m5.xlarge', runsPerDay:1, reduction:1.00,
    fileFormat:'parquet-snappy', tableFormat:'iceberg', retentionDays:365, storageClass:'standard',
    maintenanceRunsPerMonth:4, whSize:'S', autoSuspendSec:60 },
  { key:'silver', name:'Silver',           kind:'transform', enabled:true, engine:'glue',
    workers:4, workerType:'m5.xlarge', runsPerDay:1, reduction:0.80,
    fileFormat:'parquet-zstd', tableFormat:'iceberg', retentionDays:730, storageClass:'standard',
    maintenanceRunsPerMonth:4, whSize:'S', autoSuspendSec:60 },
  { key:'gold',   name:'Gold',             kind:'transform', enabled:true, engine:'glue',
    workers:2, workerType:'m5.xlarge', runsPerDay:1, reduction:0.25,
    fileFormat:'parquet-zstd', tableFormat:'iceberg', retentionDays:1095, storageClass:'standard',
    maintenanceRunsPerMonth:4, whSize:'S', autoSuspendSec:60 },
  { key:'dwload', name:'DW Load (Snowflake)', kind:'load',   enabled:true, engine:'snowflake_wh',
    workers:1, workerType:'m5.xlarge', runsPerDay:1, reduction:1.00,
    fileFormat:'parquet-zstd', tableFormat:'hive', retentionDays:1095, storageClass:'standard',
    maintenanceRunsPerMonth:0, whSize:'S', autoSuspendSec:60 },
  { key:'serve',  name:'Serving / BI',     kind:'serve',     enabled:true, engine:'snowflake_serve',
    workers:1, workerType:'m5.xlarge', runsPerDay:1, reduction:1.00,
    fileFormat:'parquet-zstd', tableFormat:'iceberg', retentionDays:0, storageClass:'standard',
    maintenanceRunsPerMonth:0, whSize:'M', autoSuspendSec:300 },
]);
