-- Justificativa da perda é texto livre. A checagem antiga só aceitava
-- códigos de outro fluxo e fazia "Marcar perda" falhar.

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_lost_reason_check;
