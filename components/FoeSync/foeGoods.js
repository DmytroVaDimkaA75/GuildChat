// components/FoeSync/foeGoods.js
//
// Епоха кожного товару FoE (id → era). Запасна таблиця на випадок, коли в
// resourceDefs гри немає поля era (найновіші товари). Джерело — resourceDefs
// живої гри (ru-локаль).

export const GOOD_ERA = {
  // BronzeAge
  wine: 'BronzeAge', dye: 'BronzeAge', alabaster: 'BronzeAge', cypress: 'BronzeAge', sandstone: 'BronzeAge',
  // IronAge
  gems: 'IronAge', cloth: 'IronAge', lead: 'IronAge', ebony: 'IronAge', limestone: 'IronAge',
  // EarlyMiddleAge
  gold: 'EarlyMiddleAge', honey: 'EarlyMiddleAge', marble: 'EarlyMiddleAge', granite: 'EarlyMiddleAge', bronze: 'EarlyMiddleAge',
  // HighMiddleAge
  glass: 'HighMiddleAge', salt: 'HighMiddleAge', ropes: 'HighMiddleAge', brick: 'HighMiddleAge', herbs: 'HighMiddleAge',
  // LateMiddleAge
  silk: 'LateMiddleAge', gunpowder: 'LateMiddleAge', brass: 'LateMiddleAge', basalt: 'LateMiddleAge', talc: 'LateMiddleAge',
  // ColonialAge
  tar: 'ColonialAge', porcelain: 'ColonialAge', wire: 'ColonialAge', coffee: 'ColonialAge', paper: 'ColonialAge',
  // IndustrialAge
  fertilizer: 'IndustrialAge', whaleoil: 'IndustrialAge', textiles: 'IndustrialAge', rubber: 'IndustrialAge', coke: 'IndustrialAge',
  // ProgressiveEra
  explosives: 'ProgressiveEra', tinplate: 'ProgressiveEra', machineparts: 'ProgressiveEra', petroleum: 'ProgressiveEra', asbestos: 'ProgressiveEra',
  // ModernEra
  ferroconcrete: 'ModernEra', flavorants: 'ModernEra', luxury_materials: 'ModernEra', packaging: 'ModernEra', convenience_food: 'ModernEra',
  // PostModernEra
  renewable_resources: 'PostModernEra', steel: 'PostModernEra', semiconductors: 'PostModernEra', filters: 'PostModernEra', dna_data: 'PostModernEra',
  // ContemporaryEra
  electromagnets: 'ContemporaryEra', gas: 'ContemporaryEra', plastics: 'ContemporaryEra', robots: 'ContemporaryEra', bionics: 'ContemporaryEra',
  // TomorrowEra
  translucent_concrete: 'TomorrowEra', smart_materials: 'TomorrowEra', papercrete: 'TomorrowEra', preservatives: 'TomorrowEra', nutrition_research: 'TomorrowEra',
  // FutureEra
  biogeochemical_data: 'FutureEra', purified_water: 'FutureEra', algae: 'FutureEra', superconductors: 'FutureEra', nanoparticles: 'FutureEra',
  // ArcticFuture
  nanowire: 'ArcticFuture', transester_gas: 'ArcticFuture', ai_data: 'ArcticFuture', paper_batteries: 'ArcticFuture', bioplastics: 'ArcticFuture', promethium: 'ArcticFuture',
  // OceanicFuture
  orichalcum: 'OceanicFuture', pearls: 'OceanicFuture', artificial_scales: 'OceanicFuture', corals: 'OceanicFuture', biolight: 'OceanicFuture', plankton: 'OceanicFuture',
  // VirtualFuture
  tea_silk: 'VirtualFuture', data_crystals: 'VirtualFuture', golden_rice: 'VirtualFuture', nanites: 'VirtualFuture', cryptocash: 'VirtualFuture',
  // SpaceAgeMars
  mars_ore: 'SpaceAgeMars', superalloys: 'SpaceAgeMars', biotech_crops: 'SpaceAgeMars', lubricants: 'SpaceAgeMars', mars_microbes: 'SpaceAgeMars', fusion_reactors: 'SpaceAgeMars',
  // SpaceAgeAsteroidBelt
  asteroid_ice: 'SpaceAgeAsteroidBelt', bromine: 'SpaceAgeAsteroidBelt', compound_fluid: 'SpaceAgeAsteroidBelt', nickel: 'SpaceAgeAsteroidBelt', platinum_crystals: 'SpaceAgeAsteroidBelt', processed_material: 'SpaceAgeAsteroidBelt',
  // SpaceAgeVenus (звірено з resourceDefs)
  soy_proteins: 'SpaceAgeVenus', venus_carbon: 'SpaceAgeVenus', microgreen_supplement: 'SpaceAgeVenus', herbal_snack: 'SpaceAgeVenus', sugar_crystals: 'SpaceAgeVenus', glowing_seaweed: 'SpaceAgeVenus',
  // SpaceAgeJupiterMoon (звірено)
  enhanced_porifera: 'SpaceAgeJupiterMoon', red_algae: 'SpaceAgeJupiterMoon', bio_creatures: 'SpaceAgeJupiterMoon', topological_records: 'SpaceAgeJupiterMoon', advanced_dna_data: 'SpaceAgeJupiterMoon', unknown_dna: 'SpaceAgeJupiterMoon',
  // SpaceAgeTitan (звірено)
  liquid_binder: 'SpaceAgeTitan', upcycled_hydrocarbons: 'SpaceAgeTitan', compressed_matter_capsule: 'SpaceAgeTitan', isolated_molecules: 'SpaceAgeTitan', experimental_data: 'SpaceAgeTitan', crystallized_hydrocarbons: 'SpaceAgeTitan',
  // SpaceAgeSpaceHub (звірено)
  silver_crystals: 'SpaceAgeSpaceHub', dark_energy_battery: 'SpaceAgeSpaceHub', oxygen_pills: 'SpaceAgeSpaceHub', deep_space_data: 'SpaceAgeSpaceHub', hypersleep_modules: 'SpaceAgeSpaceHub', dark_matter: 'SpaceAgeSpaceHub',
  // StellarAgeDiscovery (звірено)
  stel_psionic_conduits: 'StellarAgeDiscovery', stel_glyph_circuits: 'StellarAgeDiscovery', stel_xenocrystals: 'StellarAgeDiscovery', stel_metamorphic_alloys: 'StellarAgeDiscovery', stel_resonance_cores: 'StellarAgeDiscovery', stel_void_shard: 'StellarAgeDiscovery',
};

// Порядок епох (для сортування підфільтрів)
export const ERA_ORDER = [
  'BronzeAge', 'IronAge', 'EarlyMiddleAge', 'HighMiddleAge', 'LateMiddleAge', 'ColonialAge',
  'IndustrialAge', 'ProgressiveEra', 'ModernEra', 'PostModernEra', 'ContemporaryEra', 'TomorrowEra',
  'FutureEra', 'ArcticFuture', 'OceanicFuture', 'VirtualFuture',
  'SpaceAgeMars', 'SpaceAgeAsteroidBelt', 'SpaceAgeVenus', 'SpaceAgeJupiterMoon', 'SpaceAgeTitan',
  'SpaceAgeSpaceHub', 'StellarAgeDiscovery',
];

export const eraIndex = (era) => {
  const i = ERA_ORDER.indexOf(era);
  return i === -1 ? 999 : i;
};

// Епоха товару: спершу з живих resourceDefs, далі — із запасної таблиці.
export const goodEra = (key, resDefs) => resDefs?.[key]?.era || GOOD_ERA[key] || null;
