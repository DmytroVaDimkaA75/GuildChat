// components/FoeSync/foeBonuses.js
//
// Спільна математика бонусів FoE: 4 бойові числа (як в «Управлінні армією»),
// контексти (Поле битви гільдій / Експедиція / Кванти) та решта бонусів.

export const STATS = ['attAttacker', 'defAttacker', 'attDefender', 'defDefender'];

export const COMBAT_LABELS = {
  attAttacker: 'Атака — атакуюча армія',
  defAttacker: 'Захист — атакуюча армія',
  attDefender: 'Атака — оборонна армія',
  defDefender: 'Захист — оборонна армія',
};

export const GETALL_MAP = {
  att_boost_attacker: ['attAttacker'],
  def_boost_attacker: ['defAttacker'],
  att_boost_defender: ['attDefender'],
  def_boost_defender: ['defDefender'],
  att_def_boost_attacker: ['attAttacker', 'defAttacker'],
  att_def_boost_defender: ['attDefender', 'defDefender'],
  att_def_boost_attacker_defender: STATS,
};

export const GB_MAP = {
  military_boost: ['attAttacker', 'defAttacker'],
  fierce_resistance: ['attDefender', 'defDefender'],
  advanced_tactics: STATS,
};

// Типи бонусів, які не показуємо взагалі.
export const HIDDEN_BONUS_TYPES = new Set([
  'antiques_dealer_slot',
  'army_scout_time',
  'cop_playthrough_reward',
]);

// Бонуси, значення яких — просте число, а не відсоток.
export const FLAT_BONUS_TYPES = new Set([
  'guild_raids_action_points_collection',
  'guild_raids_action_points_capacity',
  'guild_raids_coins_start',
  'guild_raids_supplies_start',
  'guild_raids_goods_start',
  'guild_raids_units_start',
]);

// Перевизначення іконки для типу бонуса (де стандартна назва не підходить).
export const BONUS_ICON = {
  guild_raids_action_points_collection: 'icon_bonus_action_points_recharge_gr',
};

// Людські назви для решти типів бонусів (не бойових 4-х).
export const BONUS_LABELS = {
  // Виробництво / збір у місті
  coin_production: 'Виробництво монет',
  supply_production: 'Виробництво припасів',
  goods_production: 'Виробництво товарів',
  special_goods_production: 'Виробництво особливих товарів',
  forge_points_production: 'Виробництво СО',
  medal_production: 'Виробництво медалей',
  guild_goods_production: 'Виробництво товарів гільдії',
  diamond_production: 'Виробництво діамантів',
  happiness: 'Задоволеність',
  population: 'Населення',
  double_collection: 'Подвійний збір',

  // Квантові вторгнення
  guild_raids_coins_production: 'Виробництво Квантових монет',
  guild_raids_supplies_production: 'Виробництво Квантових ресурсів',
  guild_raids_coins_start: 'Квантові монети на старті вторгнення',
  guild_raids_supplies_start: 'Квантові запаси на старті вторгнення',
  guild_raids_goods_start: 'Квантові товари на старті вторгнення',
  guild_raids_units_start: 'Квантові юніти на старті вторгнення',
  guild_raids_action_points_capacity: 'Місткість Квантових дій',
  guild_raids_action_points_collection: 'Перезарядка Квантових дій',

  // Таверна
  tavern_shop_price: 'Ціни в таверні (знижка)',
  tavern_silver_collect_bonus: 'Збір срібла таверни',
  tavern_visit_silver_drop: 'Срібло за візит',
  tavern_visit_fp_drop: 'ОФ за візит',

  // Інші механіки
  outpost_cooldown_time: 'Відкат форпосту',
  pvp_arena_attempt_refill_interval: 'Відновлення спроб Арени',
  item_exchange_tradecoin_value: 'Курс торгових монет',
  item_exchange_gemstone_value: 'Курс самоцвітів',
  attrition_reduction: 'Зниження виснаження',
  finish_special_productions: 'Миттєве завершення виробництв',
  guild_expedition_attempts: 'Спроби в експедиції гільдії',
  unit_slot: 'Слоти юнітів',
  plunder_repel: 'Захист від пограбування',
};

export const FEATURE_LABELS = {
  all: 'загальні',
  battleground: 'Поле битви гільдій',
  guild_battleground: 'Поле битви гільдій',
  guild_expedition: 'Експедиція гільдії',
  guild_raids: 'Квантові вторгнення',
  quantum_incursions: 'Квантові вторгнення',
};

export const humanizeBonusType = (type) =>
  BONUS_LABELS[type] ||
  String(type || '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

export const emptyCombat = () => ({
  attAttacker: 0,
  defAttacker: 0,
  attDefender: 0,
  defDefender: 0,
});

const addInto = (dst, keys, value) => keys.forEach((k) => { dst[k] += value; });

// sumsAll: { type: сума } для targetedFeature 'all'
// sumsByFeature: { "type | feature": сума }
// cityGBs: масив величних споруд із city_map (бонус не входить у getAllBoosts)
export function computeCombat(sumsAll, sumsByFeature, cityGBs) {
  const base = emptyCombat();
  const feat = {};
  const getFeat = (f) => (feat[f] || (feat[f] = emptyCombat()));

  for (const [type, sum] of Object.entries(sumsAll || {})) {
    const keys = GETALL_MAP[type];
    if (keys) addInto(base, keys, sum);
  }
  for (const [k, sum] of Object.entries(sumsByFeature || {})) {
    const [type, f] = k.split(' | ');
    const keys = GETALL_MAP[type];
    if (keys) addInto(getFeat(f), keys, sum);
  }

  let gbTotal = 0;
  for (const g of cityGBs || []) {
    const b = g.bonus;
    if (!b || b.__class__ !== 'GreatBuildingUnitBonus' || typeof b.value !== 'number') continue;
    const keys = GB_MAP[b.type];
    if (!keys) continue;
    const v = Math.floor(b.value);
    const target =
      b.targetedFeature && b.targetedFeature !== 'all' ? getFeat(b.targetedFeature) : base;
    addInto(target, keys, v);
    if (target === base) gbTotal += v;
  }

  const withFeat = (f) => {
    const o = { ...base };
    if (feat[f]) STATS.forEach((k) => { o[k] += feat[f][k]; });
    return o;
  };

  return {
    base,
    contexts: {
      general: base,
      battleground: withFeat('battleground'),
      guild_expedition: withFeat('guild_expedition'),
    },
    quantum: feat.quantum_incursions || feat.guild_raids || null,
    feat,
    gbTotal,
  };
}

// Решта бонусів (усе з sumsAll, що не входить у 4 бойові числа й не GB-тип
// і не в списку прихованих).
export function otherBonusRows(sumsAll) {
  const skip = new Set([...Object.keys(GETALL_MAP), ...Object.keys(GB_MAP)]);
  return Object.entries(sumsAll || {})
    .filter(
      ([type, value]) => !skip.has(type) && !HIDDEN_BONUS_TYPES.has(type) && Number(value)
    )
    .map(([type, value]) => ({ type, label: humanizeBonusType(type), value: Number(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'uk'));
}
