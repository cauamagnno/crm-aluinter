-- Demo data for Aluinter: dashboards, pipeline Kanban, and inbox chat.
-- Idempotent. Safe to re-run (`psql -f supabase/seed.sql` or `supabase db reset`).
-- Login: demo@local.test / demo123456

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- Demo user (skipped when the account already exists)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_user_id UUID := '6c2ebe11-de0a-472d-bb13-25a4bb0328cd';
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@local.test') THEN
    RETURN;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token,
    is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'demo@local.test',
    crypt('demo123456', gen_salt('bf')),
    NOW(), NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Demo User"}'::jsonb,
    NOW(), NOW(),
    '', '', '', '',
    FALSE, FALSE
  );

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'demo@local.test'),
    'email',
    NOW(), NOW(), NOW()
  );
END $$;

-- ------------------------------------------------------------
-- Seed one account with contacts, chats, pipeline, KPIs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_aluinter_demo(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_account_id UUID;
  v_profile_id UUID;
  v_pipeline_id UUID;
  v_stage_lead UUID;
  v_stage_qual UUID;
  v_stage_quote UUID;
  v_stage_nego UUID;
  v_stage_won UUID;
  v_tag_a UUID;
  v_tag_b UUID;
  v_tag_c UUID;
  v_auto_id UUID;
  v_bc_id UUID;
  v_today TIMESTAMPTZ;
  v_month TIMESTAMPTZ;
  r RECORD;
BEGIN
  SELECT p.account_id, p.id
    INTO v_account_id, v_profile_id
  FROM profiles p
  WHERE p.user_id = p_user_id;

  IF v_account_id IS NULL THEN
    RAISE NOTICE 'seed_aluinter_demo: no profile for %', p_user_id;
    RETURN;
  END IF;

  v_today := date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo')
             AT TIME ZONE 'America/Sao_Paulo';
  v_month := date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
             AT TIME ZONE 'America/Sao_Paulo';

  UPDATE accounts
     SET default_currency = 'BRL'
   WHERE id = v_account_id;

  -- Wipe previous demo rows (keep the pipeline shell if it exists)
  DELETE FROM automation_logs WHERE account_id = v_account_id;
  DELETE FROM automations WHERE account_id = v_account_id;
  DELETE FROM broadcasts WHERE account_id = v_account_id;
  DELETE FROM deals WHERE account_id = v_account_id;
  DELETE FROM messages
   WHERE conversation_id IN (
     SELECT id FROM conversations WHERE account_id = v_account_id
   );
  DELETE FROM contact_notes WHERE account_id = v_account_id;
  DELETE FROM contact_tags
   WHERE contact_id IN (SELECT id FROM contacts WHERE account_id = v_account_id);
  DELETE FROM conversations WHERE account_id = v_account_id;
  DELETE FROM contacts WHERE account_id = v_account_id;
  DELETE FROM tags WHERE account_id = v_account_id;

  INSERT INTO tags (user_id, account_id, name, color)
  VALUES (p_user_id, v_account_id, 'Curva A', '#00A0F0')
  RETURNING id INTO v_tag_a;
  INSERT INTO tags (user_id, account_id, name, color)
  VALUES (p_user_id, v_account_id, 'Curva B', '#eab308')
  RETURNING id INTO v_tag_b;
  INSERT INTO tags (user_id, account_id, name, color)
  VALUES (p_user_id, v_account_id, 'Curva C', '#94a3b8')
  RETURNING id INTO v_tag_c;

  SELECT id INTO v_pipeline_id
  FROM pipelines
  WHERE account_id = v_account_id
  ORDER BY created_at
  LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    INSERT INTO pipelines (user_id, account_id, name)
    VALUES (p_user_id, v_account_id, 'Vendas Aluinter')
    RETURNING id INTO v_pipeline_id;

    INSERT INTO pipeline_stages (pipeline_id, name, position, color) VALUES
      (v_pipeline_id, 'Novo lead', 0, '#3b82f6'),
      (v_pipeline_id, 'Qualificado', 1, '#eab308'),
      (v_pipeline_id, 'Orçamento', 2, '#f97316'),
      (v_pipeline_id, 'Negociação', 3, '#8b5cf6'),
      (v_pipeline_id, 'Ganho', 4, '#22c55e');
  ELSE
    UPDATE pipelines SET name = 'Vendas Aluinter' WHERE id = v_pipeline_id;
    UPDATE pipeline_stages SET name = 'Novo lead',   color = '#3b82f6' WHERE pipeline_id = v_pipeline_id AND position = 0;
    UPDATE pipeline_stages SET name = 'Qualificado', color = '#eab308' WHERE pipeline_id = v_pipeline_id AND position = 1;
    UPDATE pipeline_stages SET name = 'Orçamento',   color = '#f97316' WHERE pipeline_id = v_pipeline_id AND position = 2;
    UPDATE pipeline_stages SET name = 'Negociação',  color = '#8b5cf6' WHERE pipeline_id = v_pipeline_id AND position = 3;
    UPDATE pipeline_stages SET name = 'Ganho',       color = '#22c55e' WHERE pipeline_id = v_pipeline_id AND position = 4;
  END IF;

  SELECT id INTO v_stage_lead  FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND position = 0;
  SELECT id INTO v_stage_qual  FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND position = 1;
  SELECT id INTO v_stage_quote FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND position = 2;
  SELECT id INTO v_stage_nego  FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND position = 3;
  SELECT id INTO v_stage_won   FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND position = 4;

  DROP TABLE IF EXISTS seed_people;
  CREATE TEMP TABLE seed_people (
    idx INT PRIMARY KEY,
    full_name TEXT,
    company TEXT,
    email TEXT,
    curve CHAR(1),
    created_at TIMESTAMPTZ,
    two_way_today BOOLEAN,
    unread INT,
    conv_status TEXT,
    history_days INT
  ) ON COMMIT DROP;

  INSERT INTO seed_people VALUES
    (0,  'Ricardo Alves',      'Vidraçaria Horizonte',   'ricardo.alves@horizonte.com.br', 'A', v_today - INTERVAL '80 days', TRUE,  0, 'open',    90),
    (1,  'Marina Costa',       'Construtora Atlas',      'marina.costa@atlas.eng.br',      'A', v_today - INTERVAL '70 days', TRUE,  2, 'open',    90),
    (2,  'Paulo Mendes',       'Esquadrias Litoral',     'paulo@litoral.esq.br',            'A', v_today - INTERVAL '65 days', TRUE,  0, 'open',    90),
    (3,  'Fernanda Dias',      'Arquitetura Nexo',       'fernanda@nexo.arq.br',            'A', v_today - INTERVAL '55 days', TRUE,  0, 'open',    90),
    (4,  'Bruno Teixeira',     'Reformas Prime',         'bruno@prime.ref.br',              'A', v_today - INTERVAL '50 days', TRUE,  1, 'open',    90),
    (5,  'Camila Rocha',       'Shopping Center Sul',    'camila.rocha@centersul.com',      'A', v_today - INTERVAL '48 days', TRUE,  0, 'open',    90),
    (6,  'Diego Martins',      'Hotel Brisa',            'diego.martins@hotelbrisa.com',    'A', v_today - INTERVAL '200 days',TRUE, 0, 'open',    90),
    (7,  'Helena Souza',       'Clínica Vita',           'helena@clinicavita.com.br',       'A', v_today - INTERVAL '180 days',TRUE, 0, 'open',    90),
    (8,  'Igor Nunes',         'Escola Horizonte',       'igor.nunes@escolahorizonte.com',  'A', v_today - INTERVAL '40 days', TRUE,  0, 'open',    90),
    (9,  'Juliana Prado',      'Residencial Parque',     'juliana@resparque.com.br',        'A', v_today - INTERVAL '38 days', TRUE,  0, 'open',    90),
    (10, 'Lucas Barbosa',      'Portas & Vidros',        'lucas@portasvidros.com',          'B', v_today - INTERVAL '36 days', TRUE,  0, 'open',    90),
    (11, 'Ana Beatriz Lima',   'Loja Casa Nova',         'ana@casanova.loja',               'B', v_today - INTERVAL '34 days', TRUE,  3, 'open',    90),
    (12, 'Thiago Lima',        'Construtora Vale',       'thiago@valeconstrutora.com',      'B', v_today - INTERVAL '32 days', TRUE,  0, 'open',    90),
    (13, 'Patrícia Gomes',     'Imobiliária Apex',       'patricia@apex.imob.br',           'B', v_today - INTERVAL '30 days', TRUE,  0, 'open',    90),
    (14, 'Rafael Pinto',       'Oficinas Metro',         'rafael@metrooficinas.com',        'B', v_today - INTERVAL '28 days', TRUE,  0, 'open',    90),
    (15, 'Sofia Almeida',      'Academia Pulse',         'sofia@academiapulse.com',         'B', v_today - INTERVAL '26 days', TRUE,  0, 'closed',  90),
    (16, 'Gustavo Reis',       'Padaria Real',           'gustavo@padariareal.com',         'C', v_today - INTERVAL '24 days', FALSE, 0, 'pending', 10),
    (17, 'Beatriz Lopes',      'Pet Shop Amigo',         'beatriz@petamigo.com',             'C', v_today - INTERVAL '22 days', FALSE, 1, 'pending', 90),
    (18, 'Eduardo Castro',     'Farmácia Central',       'eduardo@farmaciacentral.com',     'C', v_today - INTERVAL '20 days', FALSE, 0, 'open',    90),
    (19, 'Larissa Vieira',     'Salão Estilo',           'larissa@salaoestilo.com',         'C', v_today - INTERVAL '18 days', TRUE,  0, 'open',    90),
    (20, 'Marcelo Pinto',      'Condomínio Recreio',     'marcelo@recreio.cond.br',          'A', v_today - INTERVAL '16 days', TRUE,  0, 'open',    90),
    (21, 'Natália Serra',      'Clínica Odonto Sul',     'natalia@odontosul.com',            NULL, v_today - INTERVAL '1 day', FALSE, 0, 'open',    20),
    (22, 'Otávio Freitas',     'Galpão Logística Norte', 'otavio@lognorte.com',              NULL, v_today, TRUE,  1, 'open',    5),
    (23, 'Priscila Yamamoto',  'Franquia Aluinter SP',   'priscila@aluinter.franquia',      'A', v_today - INTERVAL '220 days',TRUE, 0, 'open',    90),
    (24, 'Renato Carvalho',    'Escola Técnica ABC',     'renato@etabc.edu.br',              NULL, v_today - INTERVAL '12 days', FALSE, 0, 'open', 40),
    (25, 'Sabrina Melo',       'Restaurante Brasa',      'sabrina@brasarest.com',            NULL, v_today - INTERVAL '10 days', FALSE, 0, 'closed', 40),
    (26, 'Túlio Andrade',      'Posto Via Norte',        'tulio@vianorte.com',               NULL, v_today - INTERVAL '8 days',  FALSE, 0, 'open',  30),
    (27, 'Vanessa Ribeiro',    'Boutique Luna',          'vanessa@boutiqueluna.com',         NULL, v_today - INTERVAL '6 days',  FALSE, 0, 'open',  20),
    (28, 'Wagner Dias',        'Novo lead Instagram',    'wagner.dias@gmail.com',            NULL, v_today, FALSE, 0, 'open',    1),
    (29, 'Yasmin Oliveira',    'Indicação arquiteta',    'yasmin.oliveira@gmail.com',        NULL, v_today, FALSE, 2, 'open',    1);

  INSERT INTO contacts (
    id, user_id, account_id, phone, name, email, company, created_at, updated_at
  )
  SELECT
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:' || idx),
    p_user_id,
    v_account_id,
    '+55 11 98800-' || lpad(idx::text, 4, '0'),
    full_name,
    email,
    company,
    created_at,
    created_at
  FROM seed_people;

  INSERT INTO contact_tags (contact_id, tag_id)
  SELECT
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:' || idx),
    CASE curve WHEN 'A' THEN v_tag_a WHEN 'B' THEN v_tag_b ELSE v_tag_c END
  FROM seed_people
  WHERE curve IS NOT NULL;

  INSERT INTO contact_notes (contact_id, user_id, account_id, note_text, created_at)
  SELECT
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:' || idx),
    p_user_id,
    v_account_id,
    CASE idx
      WHEN 0 THEN 'Cliente Curva A. Pedido recorrente de linha premium para varandas.'
      WHEN 5 THEN 'Obra do shopping: 3 mil m² de fachada. Decisão com engenharia.'
      WHEN 7 THEN 'Volume caiu neste mês — acompanhar retração.'
      WHEN 9 THEN 'Sem retorno há 10 dias. Follow-up atrasado.'
      ELSE 'Contato gerado para demonstração Aluinter.'
    END,
    created_at + INTERVAL '2 hours'
  FROM seed_people
  WHERE idx IN (0, 5, 7, 9, 22);

  INSERT INTO conversations (
    id, user_id, account_id, contact_id, status, assigned_agent_id,
    unread_count, created_at, updated_at
  )
  SELECT
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:' || idx),
    p_user_id,
    v_account_id,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:' || idx),
    conv_status,
    CASE WHEN idx IN (16, 17, 28) THEN NULL ELSE p_user_id END,
    unread,
    created_at,
    created_at
  FROM seed_people;

  -- Historical back-and-forth so charts and response-time have volume
  INSERT INTO messages (
    conversation_id, sender_type, sender_id, content_type, content_text, status, created_at
  )
  SELECT
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:' || p.idx),
    CASE WHEN gs.n % 2 = 0 THEN 'customer' ELSE 'agent' END,
    CASE WHEN gs.n % 2 = 0 THEN NULL ELSE p_user_id END,
    'text',
    CASE
      WHEN gs.n % 2 = 0 THEN
        (ARRAY[
          'Oi, vocês fazem esquadria de alumínio para varanda?',
          'Qual o prazo de fabricação para 8 folhas?',
          'Conseguem visitar a obra essa semana?',
          'O orçamento inclui instalação?',
          'Tem linha com vidro laminado 8 mm?',
          'Pode mandar referência de cor bronze?'
        ])[1 + ((p.idx + gs.n) % 6)]
      ELSE
        (ARRAY[
          'Oi! Sim, trabalhamos linha premium. Qual a medida da vaga?',
          'Prazo médio de 12 a 18 dias úteis após aprovação.',
          'Consigo encaixar uma visita técnica amanhã à tarde.',
          'Sim, instalação e garantia de 5 anos inclusas.',
          'Temos laminado 8 mm e temperado 10 mm em estoque.',
          'Te envio a carta de cores ainda hoje.'
        ])[1 + ((p.idx + gs.n) % 6)]
    END,
    CASE WHEN gs.n % 2 = 0 THEN 'delivered' ELSE 'read' END,
    v_today
      - ((gs.n / 2) * INTERVAL '1 day')
      + INTERVAL '9 hours'
      + ((gs.n % 2) * INTERVAL '11 minutes')
      + (p.idx * INTERVAL '90 seconds')
  FROM seed_people p
  CROSS JOIN generate_series(2, 79) AS gs(n)
  WHERE (gs.n / 2) <= p.history_days
    AND (p.idx <> 16 OR (gs.n / 2) >= 10)
    AND (p.idx + gs.n) % 4 <> 0
    AND EXTRACT(DOW FROM (v_today - ((gs.n / 2) * INTERVAL '1 day'))) <> 0;

  -- Real conversations today: inbound + outbound on the same thread
  INSERT INTO messages (
    conversation_id, sender_type, sender_id, content_type, content_text, status, created_at
  )
  SELECT
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:' || idx),
    'customer',
    NULL,
    'text',
    (ARRAY[
      'Bom dia! Quero fechar o orçamento da varanda.',
      'Vocês conseguem emitir o pedido ainda hoje?',
      'Confirmo a visita técnica às 15h.',
      'Pode repetir o valor com o vidro laminado?',
      'A engenharia aprovou a fachada. Seguimos?'
    ])[1 + (idx % 5)],
    'delivered',
    v_today + INTERVAL '8 hours' + (idx * INTERVAL '7 minutes')
  FROM seed_people
  WHERE two_way_today;

  INSERT INTO messages (
    conversation_id, sender_type, sender_id, content_type, content_text, status, created_at
  )
  SELECT
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:' || idx),
    'agent',
    p_user_id,
    'text',
    (ARRAY[
      'Bom dia! Fecho o pedido e te envio a minuta em 20 min.',
      'Sim, emito hoje. Me confirma o CNPJ para a NF.',
      'Perfeito, técnico já está na rota.',
      'Com laminado 8 mm fica R$ 1.240 / m² instalado.',
      'Ótimo. Abro o pedido e te mando o cronograma.'
    ])[1 + (idx % 5)],
    'read',
    v_today + INTERVAL '8 hours' + (idx * INTERVAL '7 minutes') + INTERVAL '6 minutes'
  FROM seed_people
  WHERE two_way_today;

  -- Latest inbound left unread on a few threads
  INSERT INTO messages (
    conversation_id, sender_type, sender_id, content_type, content_text, status, created_at
  )
  SELECT
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:' || idx),
    'customer',
    NULL,
    'text',
    'Pode me ligar quando tiver um minuto?',
    'delivered',
    v_today + INTERVAL '10 hours' + (idx * INTERVAL '3 minutes')
  FROM seed_people
  WHERE unread > 0 AND two_way_today;

  -- Leads created today with no history still need a first inbound
  INSERT INTO messages (
    conversation_id, sender_type, sender_id, content_type, content_text, status, created_at
  )
  SELECT
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:' || idx),
    'customer',
    NULL,
    'text',
    'Oi, vim pelo Instagram. Vocês fazem esquadria?',
    'delivered',
    v_today + INTERVAL '9 hours'
  FROM seed_people
  WHERE idx IN (28, 29);

  UPDATE conversations conv
     SET last_message_text = m.content_text,
         last_message_at = m.created_at,
         updated_at = m.created_at
    FROM (
      SELECT DISTINCT ON (conversation_id)
             conversation_id, content_text, created_at
        FROM messages
       WHERE conversation_id IN (
         SELECT id FROM conversations WHERE account_id = v_account_id
       )
       ORDER BY conversation_id, created_at DESC
    ) m
   WHERE conv.id = m.conversation_id;

  -- Open quotes created this week (Kanban + KPI 2)
  INSERT INTO deals (
    user_id, account_id, pipeline_id, stage_id, contact_id, conversation_id,
    title, value, currency, notes, expected_close_date, status,
    assigned_to, created_at, updated_at
  )
  SELECT
    p_user_id, v_account_id, v_pipeline_id,
    d.stage_id,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:' || d.idx),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:' || d.idx),
    d.title, d.value, 'BRL', d.notes, (v_today + d.close_in)::date, 'open',
    v_profile_id, v_today + INTERVAL '9 hours', v_today + INTERVAL '9 hours'
  FROM (VALUES
    (0,  v_stage_qual,  'Varandas — Vidraçaria Horizonte',     28500, 'Linha premium 6 vãos',           INTERVAL '12 days'),
    (1,  v_stage_quote, 'Fachada — Construtora Atlas',         146000,'3 torres, medição na quinta',    INTERVAL '20 days'),
    (2,  v_stage_quote, 'Esquadrias Litoral — casa de praia',  62400, 'Guarda-corpo + portas de correr', INTERVAL '10 days'),
    (8,  v_stage_quote, 'Escola Horizonte — bloco B',          38800, 'Janelas pivotantes',             INTERVAL '18 days'),
    (9,  v_stage_nego,  'Residencial Parque — 42 unidades',    188000,'Engenharia revisando memorial',  INTERVAL '9 days'),
    (10, v_stage_lead,  'Portas & Vidros — reposição',         18200, 'Lead Instagram',                 INTERVAL '25 days'),
    (11, v_stage_lead,  'Casa Nova — vitrine',                 22100, 'Porta automática',               INTERVAL '14 days'),
    (14, v_stage_qual,  'Oficinas Metro — portas industriais', 31200, 'Pintura eletrostática',          INTERVAL '16 days'),
    (17, v_stage_lead,  'Pet Shop Amigo — vitrine',            14800, 'Lead Google',                    INTERVAL '22 days'),
    (19, v_stage_nego,  'Salão Estilo — box e espelhos',       27400, 'Aguardando cor',                 INTERVAL '8 days'),
    (20, v_stage_qual,  'Condomínio Recreio — halls',          51800, '12 halls, 4 andares',            INTERVAL '15 days'),
    (22, v_stage_quote, 'Galpão Logística Norte',              91000, 'Portas seccionadas',             INTERVAL '19 days'),
    (28, v_stage_lead,  'Lead Instagram — Wagner',             9600,  'Primeiro contato hoje',          INTERVAL '30 days')
  ) AS d(idx, stage_id, title, value, notes, close_in);

  -- Stale open deal (follow-up off cadence)
  INSERT INTO deals (
    user_id, account_id, pipeline_id, stage_id, contact_id, conversation_id,
    title, value, currency, notes, expected_close_date, status,
    assigned_to, created_at, updated_at
  ) VALUES (
    p_user_id, v_account_id, v_pipeline_id, v_stage_nego,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:16'),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:16'),
    'Padaria Real — vitrine da rua',
    14800, 'BRL', 'Sem retorno há 10 dias',
    (v_today + INTERVAL '5 days')::date,
    'open', v_profile_id,
    v_today - INTERVAL '21 days',
    v_today - INTERVAL '10 days'
  );

  -- Lost
  INSERT INTO deals (
    user_id, account_id, pipeline_id, stage_id, contact_id, conversation_id,
    title, value, currency, notes, status, assigned_to, created_at, updated_at
  ) VALUES (
    p_user_id, v_account_id, v_pipeline_id, v_stage_nego,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:15'),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:15'),
    'Academia Pulse — vestiários',
    19600, 'BRL', 'Fechou com concorrente',
    'lost', v_profile_id,
    v_today - INTERVAL '18 days',
    v_today - INTERVAL '3 days'
  );

  -- Won this month: new logos
  INSERT INTO deals (
    user_id, account_id, pipeline_id, stage_id, contact_id, conversation_id,
    title, value, currency, notes, status, assigned_to, created_at, updated_at
  )
  SELECT
    p_user_id, v_account_id, v_pipeline_id, v_stage_won,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:' || d.idx),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:' || d.idx),
    d.title, d.value, 'BRL', 'Pedido faturado', 'won', v_profile_id,
    v_month + d.created_off, v_month + d.won_off
  FROM (VALUES
    (3,  'Nexo — janelas do escritório',     42000, INTERVAL '2 days',  INTERVAL '4 days'),
    (4,  'Reformas Prime — 3 apartamentos',  38500, INTERVAL '3 days',  INTERVAL '6 days'),
    (5,  'Shopping Sul — trecho 1 fachada',  68000, INTERVAL '1 day',   INTERVAL '8 days'),
    (12, 'Construtora Vale — torre piloto',  29000, INTERVAL '5 days',  INTERVAL '9 days'),
    (13, 'Apex — mostruário da loja',        41000, INTERVAL '4 days',  INTERVAL '7 days'),
    (18, 'Farmácia Central — vitrine',       18500, INTERVAL '6 days',  INTERVAL '10 days'),
    (24, 'Escola Técnica ABC — laboratório', 33000, INTERVAL '7 days',  INTERVAL '11 days'),
    (25, 'Restaurante Brasa — fechamento',   28000, INTERVAL '2 days',  INTERVAL '5 days'),
    (26, 'Posto Via Norte — loja de conveniência', 36000, INTERVAL '8 days', INTERVAL '12 days'),
    (27, 'Boutique Luna — porta pivotante',  22000, INTERVAL '3 days',  INTERVAL '9 days')
  ) AS d(idx, title, value, created_off, won_off);

  -- Two extra quotes created today that already won (KPI 2)
  INSERT INTO deals (
    user_id, account_id, pipeline_id, stage_id, contact_id, conversation_id,
    title, value, currency, notes, status, assigned_to, created_at, updated_at
  ) VALUES
  (
    p_user_id, v_account_id, v_pipeline_id, v_stage_won,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:3'),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:3'),
    'Nexo — complemento guarda-corpo',
    8900, 'BRL', 'Add-on do pedido da Nexo', 'won', v_profile_id,
    v_today + INTERVAL '11 hours', v_today + INTERVAL '11 hours'
  ),
  (
    p_user_id, v_account_id, v_pipeline_id, v_stage_won,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:4'),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:4'),
    'Prime — box do lavabo',
    6400, 'BRL', 'Fechado no WhatsApp hoje', 'won', v_profile_id,
    v_today + INTERVAL '12 hours', v_today + INTERVAL '12 hours'
  );

  -- Reactivated (previous win > 90 days ago)
  INSERT INTO deals (
    user_id, account_id, pipeline_id, stage_id, contact_id, conversation_id,
    title, value, currency, status, assigned_to, created_at, updated_at
  ) VALUES
  (
    p_user_id, v_account_id, v_pipeline_id, v_stage_won,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:6'),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:6'),
    'Hotel Brisa — reforma 2025',
    41000, 'BRL', 'won', v_profile_id,
    v_today - INTERVAL '160 days', v_today - INTERVAL '150 days'
  ),
  (
    p_user_id, v_account_id, v_pipeline_id, v_stage_won,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:6'),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:6'),
    'Hotel Brisa — cobertura 2026',
    52000, 'BRL', 'won', v_profile_id,
    v_month + INTERVAL '3 days', v_month + INTERVAL '9 days'
  ),
  (
    p_user_id, v_account_id, v_pipeline_id, v_stage_won,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:23'),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:23'),
    'Franquia Aluinter SP — 2025',
    39000, 'BRL', 'won', v_profile_id,
    v_today - INTERVAL '210 days', v_today - INTERVAL '200 days'
  ),
  (
    p_user_id, v_account_id, v_pipeline_id, v_stage_won,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:23'),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:23'),
    'Franquia Aluinter SP — showroom',
    47000, 'BRL', 'won', v_profile_id,
    v_month + INTERVAL '2 days', v_month + INTERVAL '8 days'
  );

  -- Retraction: Clínica Vita sold a lot in the last 3 months, little this month
  INSERT INTO deals (
    user_id, account_id, pipeline_id, stage_id, contact_id, conversation_id,
    title, value, currency, status, assigned_to, created_at, updated_at
  )
  SELECT
    p_user_id, v_account_id, v_pipeline_id, v_stage_won,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:7'),
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':v:7'),
    d.title, d.value, 'BRL', 'won', v_profile_id, d.at - INTERVAL '10 days', d.at
  FROM (VALUES
    ('Clínica Vita — bloco A', 80000, v_month - INTERVAL '3 months' + INTERVAL '12 days'),
    ('Clínica Vita — bloco B', 75000, v_month - INTERVAL '2 months' + INTERVAL '10 days'),
    ('Clínica Vita — recepção', 70000, v_month - INTERVAL '1 month' + INTERVAL '8 days'),
    ('Clínica Vita — reposição', 15000, v_month + INTERVAL '6 days')
  ) AS d(title, value, at);

  INSERT INTO broadcasts (
    user_id, account_id, name, template_name, template_language,
    status, total_recipients, sent_count, delivered_count, read_count, replied_count,
    created_at, updated_at
  ) VALUES (
    p_user_id, v_account_id,
    'Campanha orçamento primavera',
    'orcamento_primavera',
    'pt_BR',
    'sent', 18, 18, 16, 11, 4,
    v_today - INTERVAL '2 days',
    v_today - INTERVAL '2 days'
  )
  RETURNING id INTO v_bc_id;

  INSERT INTO broadcast_recipients (broadcast_id, contact_id, status, sent_at, delivered_at, read_at)
  SELECT
    v_bc_id,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:' || idx),
    CASE WHEN idx % 5 = 0 THEN 'read' ELSE 'delivered' END,
    v_today - INTERVAL '2 days',
    v_today - INTERVAL '2 days' + INTERVAL '20 seconds',
    CASE WHEN idx % 5 = 0 THEN v_today - INTERVAL '2 days' + INTERVAL '2 hours' ELSE NULL END
  FROM seed_people
  WHERE idx < 18;

  INSERT INTO automations (
    user_id, account_id, name, description, trigger_type, trigger_config,
    is_active, execution_count, last_executed_at, created_at
  ) VALUES (
    p_user_id, v_account_id,
    'Boas-vindas novo contato',
    'Envia saudação quando um contato entra pelo WhatsApp',
    'new_contact_created',
    '{}'::jsonb,
    TRUE, 9, v_today + INTERVAL '8 hours', v_today - INTERVAL '20 days'
  )
  RETURNING id INTO v_auto_id;

  INSERT INTO automation_logs (
    automation_id, user_id, account_id, contact_id, trigger_event, status, created_at
  )
  SELECT
    v_auto_id, p_user_id, v_account_id,
    uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid,
                     v_account_id::text || ':c:' || idx),
    'new_contact_created',
    'success',
    v_today + INTERVAL '8 hours' + (idx * INTERVAL '4 minutes')
  FROM seed_people
  WHERE idx IN (22, 28, 29);

  INSERT INTO automations (
    user_id, account_id, name, description, trigger_type, trigger_config,
    is_active, execution_count, last_executed_at, created_at
  ) VALUES (
    p_user_id, v_account_id,
    'Follow-up Curva A',
    'Lembra o consultor se um Curva A fica 7 dias sem mensagem',
    'time_based',
    '{"days": 7}'::jsonb,
    TRUE, 3, v_today - INTERVAL '1 day', v_today - INTERVAL '14 days'
  );

  RAISE NOTICE 'seed_aluinter_demo: account % ready', v_account_id;
END;
$$;

SELECT public.seed_aluinter_demo(user_id) FROM profiles;
