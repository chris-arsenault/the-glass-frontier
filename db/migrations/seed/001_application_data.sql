INSERT INTO app.model_config (
  model_id, api_model_id, display_name, provider_id, is_enabled,
  context_window, max_output_tokens, cost_per_1k_input, cost_per_1k_output, reasoning_efforts
)
VALUES
  ('gpt-5.6-luna', 'gpt-5.6-luna', 'GPT-5.6 Luna', 'openai', true, 1050000, 128000, 0.0002, 0.0012, ARRAY['low', 'medium', 'high']),
  ('gpt-5.6-terra', 'gpt-5.6-terra', 'GPT-5.6 Terra', 'openai', true, 1050000, 128000, 0.002, 0.012, ARRAY['low', 'medium', 'high']),
  ('gpt-5.6-sol', 'gpt-5.6-sol', 'GPT-5.6 Sol', 'openai', true, 1050000, 128000, 0.005, 0.03, ARRAY['low', 'medium', 'high']),
  ('claude-sonnet-5', 'us.anthropic.claude-sonnet-5', 'Claude Sonnet 5', 'bedrock', true, 1000000, 128000, 0.003, 0.015, ARRAY['low', 'medium', 'high']),
  ('amazon-nova-pro', 'us.amazon.nova-pro-v1:0', 'Amazon Nova Pro', 'bedrock', true, 300000, 5000, 0.0008, 0.0016, ARRAY['low']),
  -- Nova Lite v1 takes no reasoning configuration at all — it rejects one as
  -- malformed — and the provider only sends that field for Nova 2 Lite. Its
  -- output ceiling is 10k, measured; the registry clamps callers to it.
  ('amazon-nova-lite', 'us.amazon.nova-lite-v1:0', 'Amazon Nova Lite', 'bedrock', true, 300000, 10000, 0.00006, 0.00012, ARRAY['low']),
  ('amazon-nova-2-lite', 'us.amazon.nova-2-lite-v1:0', 'Amazon Nova 2 Lite', 'bedrock', true, 1000000, 65536, 0.0003, 0.00125, ARRAY['low', 'medium']),
  -- Open-weight models, measured against Bedrock us-east-1 on 2026-08-27: all
  -- on-demand, all accept Converse tool use and a forced tool choice, none take
  -- a reasoning field. Prices are the AWS Pricing API's own, per 1k tokens.
  ('gpt-oss-120b', 'openai.gpt-oss-120b-1:0', 'GPT OSS 120B', 'bedrock', true, 128000, 32768, 0.00015, 0.0006, ARRAY['low']),
  ('gpt-oss-20b', 'openai.gpt-oss-20b-1:0', 'GPT OSS 20B', 'bedrock', true, 128000, 32768, 0.00007, 0.0003, ARRAY['low']),
  ('kimi-k2-thinking', 'moonshot.kimi-k2-thinking', 'Kimi K2 Thinking', 'bedrock', true, 262144, 32768, 0.0006, 0.0025, ARRAY['low']),
  ('qwen3-next-80b', 'qwen.qwen3-next-80b-a3b', 'Qwen3 Next 80B A3B', 'bedrock', true, 262144, 32768, 0.00014, 0.0012, ARRAY['low']),
  ('qwen3-32b', 'qwen.qwen3-32b-v1:0', 'Qwen3 32B', 'bedrock', true, 32768, 16384, 0.00015, 0.0003, ARRAY['low'])
ON CONFLICT (model_id) DO UPDATE SET
  api_model_id = EXCLUDED.api_model_id,
  display_name = EXCLUDED.display_name,
  provider_id = EXCLUDED.provider_id,
  is_enabled = EXCLUDED.is_enabled,
  context_window = EXCLUDED.context_window,
  max_output_tokens = EXCLUDED.max_output_tokens,
  cost_per_1k_input = EXCLUDED.cost_per_1k_input,
  cost_per_1k_output = EXCLUDED.cost_per_1k_output,
  reasoning_efforts = EXCLUDED.reasoning_efforts,
  updated_at = now();

-- Slot 1 only. The shadow slots are a per-player choice with no sensible
-- default: leaving them unset is what keeps a turn at two generations.
INSERT INTO app.model_category_config (category, model_id, player_id, slot)
VALUES
  ('classification', 'amazon-nova-lite', NULL, 1),
  ('prose', 'kimi-k2-thinking', NULL, 1)
ON CONFLICT (category, player_id, slot) DO UPDATE SET
  model_id = EXCLUDED.model_id,
  updated_at = now();

INSERT INTO world_prominence (id, rank)
VALUES
  ('forgotten', 0),
  ('marginal', 1),
  ('recognized', 2),
  ('renowned', 3),
  ('mythic', 4)
ON CONFLICT (id) DO UPDATE SET rank = EXCLUDED.rank;

INSERT INTO world_kind (id, category, display_name, default_status)
VALUES
  ('ability', 'atlas', 'Ability', NULL),
  ('artifact', 'atlas', 'Artifact', NULL),
  ('concept', 'atlas', 'Concept', NULL),
  ('conflict', 'atlas', 'Conflict', NULL),
  ('creature', 'atlas', 'Creature', NULL),
  ('culture', 'atlas', 'Culture', NULL),
  ('edict', 'atlas', 'Edict', NULL),
  ('era', 'atlas', 'Era', NULL),
  ('faction', 'atlas', 'Faction', NULL),
  ('geographic_location', 'atlas', 'Geographic Location', NULL),
  ('incident', 'atlas', 'Incident', NULL),
  ('installation', 'atlas', 'Installation', NULL),
  ('npc', 'atlas', 'NPC', NULL),
  ('phenomenon', 'atlas', 'Phenomenon', NULL),
  ('resource', 'atlas', 'Resource', NULL),
  ('rumor', 'atlas', 'Rumor', NULL),
  ('species', 'atlas', 'Species', NULL),
  ('transport', 'atlas', 'Transport', NULL)
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  default_status = EXCLUDED.default_status,
  updated_at = now();

INSERT INTO world_subkind (id, kind_id)
VALUES
  ('learned_ability', 'ability'),
  ('innate_ability', 'ability'),
  ('instrument', 'artifact'),
  ('record', 'artifact'),
  ('relic', 'artifact'),
  ('machine', 'artifact'),
  ('doctrine', 'concept'),
  ('practice', 'concept'),
  ('technology', 'concept'),
  ('physical_system', 'concept'),
  ('social_system', 'concept'),
  ('reference_concept', 'concept'),
  ('war', 'conflict'),
  ('campaign', 'conflict'),
  ('dispute', 'conflict'),
  ('animal', 'creature'),
  ('anomaly', 'creature'),
  ('overview', 'culture'),
  ('regional_culture', 'culture'),
  ('way_of_life', 'culture'),
  ('naming_practice', 'culture'),
  ('historical_period', 'era'),
  ('government', 'faction'),
  ('governing_intelligence', 'faction'),
  ('company', 'faction'),
  ('civic_body', 'faction'),
  ('resistance_network', 'faction'),
  ('community', 'faction'),
  ('trade_network', 'faction'),
  ('religious_order', 'faction'),
  ('research_body', 'faction'),
  ('mutual_aid', 'faction'),
  ('star_system', 'geographic_location'),
  ('celestial_body', 'geographic_location'),
  ('orbit', 'geographic_location'),
  ('world_region', 'geographic_location'),
  ('region', 'geographic_location'),
  ('settlement', 'geographic_location'),
  ('frontier', 'geographic_location'),
  ('hazardous_zone', 'geographic_location'),
  ('disaster', 'incident'),
  ('campaign', 'incident'),
  ('policy_action', 'incident'),
  ('operational_failure', 'incident'),
  ('dispute', 'incident'),
  ('discovery', 'incident'),
  ('founding', 'incident'),
  ('migration', 'incident'),
  ('settlement', 'installation'),
  ('station', 'installation'),
  ('workshop', 'installation'),
  ('infrastructure', 'installation'),
  ('archive', 'installation'),
  ('clinic', 'installation'),
  ('warehouse', 'installation'),
  ('landmark', 'installation'),
  ('border_post', 'installation'),
  ('official', 'npc'),
  ('specialist', 'npc'),
  ('worker', 'npc'),
  ('leader', 'npc'),
  ('courier', 'npc'),
  ('dissident', 'npc'),
  ('physical_phenomenon', 'phenomenon'),
  ('ecological_phenomenon', 'phenomenon'),
  ('social_condition', 'phenomenon'),
  ('catastrophe', 'phenomenon'),
  ('material', 'resource'),
  ('biological_material', 'resource'),
  ('device', 'resource'),
  ('medicine', 'resource'),
  ('food', 'resource'),
  ('data', 'resource'),
  ('infrastructure', 'resource'),
  ('sapient_species', 'species'),
  ('overview', 'species'),
  ('vessel', 'transport')
ON CONFLICT ON CONSTRAINT world_subkind_pk DO NOTHING;

INSERT INTO world_relationship_kind (id, description, category, default_strength)
VALUES
  ('active_during', 'Subject was active during the target era or conflict.', 'causal', 0.3),
  ('caused', 'Subject brought the target about.', 'causal', 0.7),
  ('caused_by', 'Subject was brought about by the target.', 'causal', 0.7),
  ('causes', 'Subject actively produces the target condition.', 'causal', 0.7),
  ('created', 'Subject made the target.', 'causal', 0.7),
  ('created_during', 'Subject came into being during the target era or event.', 'causal', 0.3),
  ('destroyed', 'Subject destroyed the target.', 'causal', 0.7),
  ('disappeared_during', 'Subject vanished during the target era or event.', 'causal', 0.3),
  ('emerged_during', 'Subject emerged during the target era or event.', 'causal', 0.3),
  ('fought_over', 'The conflict was fought over the target resource.', 'causal', 0.7),
  ('originated_in', 'Subject originated in the target place or era.', 'causal', 0.5),
  ('participated_in', 'Subject took part in the target incident or conflict.', 'causal', 0.6),
  ('adjacent_to', 'Two places share a local boundary or lie directly beside one another.', 'spatial', 0.3),
  ('founded_in', 'Subject was founded in the target place.', 'spatial', 0.4),
  ('headquartered_in', 'Subject is headquartered in the target place.', 'spatial', 0.6),
  ('hosts', 'Subject place hosts the target.', 'spatial', 0.4),
  ('inner_of', 'Subject lies inward of the target.', 'spatial', 0.3),
  ('in_orbit_of', 'Subject sits in orbit of the target body.', 'spatial', 0.3),
  ('located_in', 'Subject is located in the target place.', 'spatial', 0.5),
  ('manifests_at', 'Subject manifests or is present at the target place.', 'spatial', 0.4),
  ('on_surface_of', 'Subject sits on the surface of the target body.', 'spatial', 0.3),
  ('operates_in', 'Subject operates in the target place or region.', 'spatial', 0.5),
  ('orbits', 'Subject orbits the target body.', 'spatial', 0.3),
  ('part_of', 'Subject is a part of the target.', 'spatial', 0.5),
  ('terminus_of', 'Subject place is an endpoint of the target route.', 'spatial', 0.4),
  ('chairs', 'Subject chairs the target body.', 'organizational', 0.8),
  ('employed_by', 'Subject is employed by the target.', 'organizational', 0.6),
  ('governed_by', 'Subject is governed by the target.', 'organizational', 0.7),
  ('governs', 'Subject governs the target.', 'organizational', 0.7),
  ('leads', 'Subject leads the target.', 'organizational', 0.9),
  ('member_of', 'Subject is a member of the target.', 'organizational', 0.7),
  ('owned_by', 'Subject is owned by the target.', 'organizational', 0.6),
  ('regulates', 'Subject regulates the target.', 'organizational', 0.5),
  ('succeeded', 'Subject succeeded the target.', 'organizational', 0.5),
  ('supplies', 'Subject supplies the target.', 'organizational', 0.5),
  ('trains', 'Subject trains the target.', 'organizational', 0.5),
  ('born_in', 'Subject was born in the target place.', 'social', 0.4),
  ('carries', 'Subject carries the target.', 'social', 0.4),
  ('commemorates', 'Subject commemorates the target.', 'social', 0.4),
  ('cooperates_with', 'Subject cooperates with the target.', 'social', 0.6),
  ('inhabits', 'Subject inhabits the target place.', 'social', 0.6),
  ('maintains', 'Subject maintains the target.', 'social', 0.5),
  ('possesses', 'Subject possesses the target.', 'social', 0.6),
  ('practiced_by', 'Subject practice is practiced by the target.', 'social', 0.6),
  ('studies', 'Subject studies the target.', 'social', 0.5),
  ('taught', 'Subject taught the target.', 'social', 0.5),
  ('attuned_to', 'Subject is attuned to the target; resonance is a physical force here, so attunement is a real edge.', 'technical', 0.7),
  ('built', 'Subject built the target.', 'technical', 0.5),
  ('conducted_by', 'Subject process is conducted by the target.', 'technical', 0.5),
  ('depends_on', 'Subject depends on the target to survive or function.', 'technical', 0.6),
  ('derived_from', 'Subject is derived from the target.', 'technical', 0.5),
  ('designed', 'Subject designed the target.', 'technical', 0.5),
  ('powers', 'Subject powers the target.', 'technical', 0.6),
  ('sourced_from', 'Subject is sourced from the target.', 'technical', 0.5),
  ('embeds', 'Subject includes the target as part of its reader-facing account.', 'narrative', 0.6),
  ('embodies', 'Subject embodies the target concept.', 'narrative', 0.6),
  ('resonates_with', 'Subject resonates with the target in the sympathetic, narrative sense.', 'narrative', 0.6),
  ('hiding_from', 'DM-only: subject is hiding from or avoiding the target.', 'dm', 0.8),
  ('seeping_through', 'DM-only: the False Form reaches through the target here.', 'dm', 0.8),
  ('related_to', 'Generic association. Use the narrowest verb that states the actual fact.', 'banned', 0.0)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  default_strength = EXCLUDED.default_strength;

INSERT INTO world_relationship_rule (relationship_id, src_kind, dst_kind)
VALUES ('fought_over', 'conflict', 'resource')
ON CONFLICT ON CONSTRAINT world_relationship_rule_pk DO NOTHING;

DELETE FROM world_relationship_rule
WHERE (relationship_id, src_kind, dst_kind) <> ('fought_over', 'conflict', 'resource');
