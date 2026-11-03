-- Translate leftover English labels stored in existing rows.

UPDATE pipeline_stages SET name = 'Prospecção'
  WHERE name IN ('Lead', 'Leads', 'New Lead');
UPDATE pipeline_stages SET name = 'Qualificação'
  WHERE name IN ('Qualification', 'Qualified');
UPDATE pipeline_stages SET name = 'Levantamento de oportunidades'
  WHERE name IN ('Proposal', 'Opportunity');
UPDATE pipeline_stages SET name = 'Envio do orçamento'
  WHERE name IN ('Quote', 'Quotation', 'Sent Quote');
UPDATE pipeline_stages SET name = 'Negociação'
  WHERE name IN ('Negotiation');
UPDATE pipeline_stages SET name = 'Fechamento'
  WHERE name IN ('Won', 'Closed Won', 'Closed');

UPDATE pipelines SET name = 'Vendas Aluinter'
  WHERE name IN ('Sales', 'Sales Pipeline', 'Default');

UPDATE automations SET
  name = 'Mensagem de boas-vindas',
  description = 'Responde automaticamente o primeiro contato com uma saudação.'
  WHERE name = 'Welcome Message';
UPDATE automations SET
  name = 'Fora do expediente',
  description = 'Responde automaticamente fora do horário para ninguém ficar sem retorno.'
  WHERE name = 'Out of Office';
UPDATE automations SET
  name = 'Qualificar lead',
  description = 'Faz perguntas de qualificação para filtrar leads de entrada.'
  WHERE name = 'Lead Qualifier';
UPDATE automations SET
  name = 'Lembrete de follow-up',
  description = 'Envia um toque se o contato não responder em 24 horas.'
  WHERE name = 'Follow-up Reminder';

UPDATE deals SET title = replace(title, 'Lead Instagram', 'Lead do Instagram')
  WHERE title LIKE '%Lead Instagram%';
UPDATE deals SET notes = replace(notes, 'Lead Instagram', 'Lead do Instagram')
  WHERE notes LIKE '%Lead Instagram%';
