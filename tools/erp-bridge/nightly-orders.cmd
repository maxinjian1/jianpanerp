@echo off
rem 计划任务 anet-erp-orders-export（每天 23:10，电脑时间）调用。结果见 tools\erp-bridge\out\orders-export.log
cd /d C:\Users\maxinjian\source\jianpanerp
"C:\Program Files\nodejs\node.exe" tools\erp-bridge\nightly-orders.mjs >> tools\erp-bridge\out\orders-export-console.log 2>&1
