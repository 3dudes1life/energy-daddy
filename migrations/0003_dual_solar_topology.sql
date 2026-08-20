INSERT OR IGNORE INTO sources(id,provider,kind,scope,status,metadata_json) VALUES
('enphase-site','Enphase','solar_site_meter','site','planned','{"cadence":"15m","role":"array_b_and_site_meter","production_scope":"array_b","site_meter_capabilities":["consumption","grid_import","grid_export"]}');

UPDATE sources
SET scope='array_a', metadata_json='{"role":"array_a_production","production_scope":"array_a"}'
WHERE id='solaredge-site';

UPDATE sources
SET status='historical_only', metadata_json='{"role":"battery_impact","live_polling":false,"reason":"avoid_paid_live_api"}'
WHERE id='tesla-site';
