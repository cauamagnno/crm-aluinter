-- Keep the six Negociações etapas aligned even after demo seed reruns.

UPDATE pipeline_stages SET name = 'Prospecção', color = '#64748b'
  WHERE position = 0;
UPDATE pipeline_stages SET name = 'Qualificação', color = '#0ea5e9'
  WHERE position = 1;
UPDATE pipeline_stages SET name = 'Levantamento de oportunidades', color = '#8b5cf6'
  WHERE position = 2;
UPDATE pipeline_stages SET name = 'Envio do orçamento', color = '#f97316'
  WHERE position = 3;
UPDATE pipeline_stages SET name = 'Negociação', color = '#eab308'
  WHERE position = 4;
UPDATE pipeline_stages SET name = 'Fechamento', color = '#22c55e'
  WHERE position = 5;

INSERT INTO pipeline_stages (pipeline_id, name, color, position)
SELECT p.id, 'Levantamento de oportunidades', '#8b5cf6', 2
FROM pipelines p
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_stages s
  WHERE s.pipeline_id = p.id AND s.position = 2
);

INSERT INTO pipeline_stages (pipeline_id, name, color, position)
SELECT p.id, 'Fechamento', '#22c55e', 5
FROM pipelines p
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_stages s
  WHERE s.pipeline_id = p.id AND s.position = 5
);
