const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeBuildingDefinition,
  resolveRequestedBuildingEra,
  unwrapBuildingDefinition,
} = require('./foeBuildingMetadata');

test('canonicalizes the requested era from the building id and instance era', () => {
  assert.equal(
    resolveRequestedBuildingEra('T_AllAge_Test', 'FutureEra', 'ModernEra'),
    'AllAge'
  );
  assert.equal(
    resolveRequestedBuildingEra('W_MultiAge_Test', 'AllAge', 'ModernEra'),
    'ModernEra'
  );
  assert.equal(
    resolveRequestedBuildingEra('W_MultiAge_Test', 'IndustrialAge', 'ModernEra'),
    'IndustrialAge'
  );
  assert.equal(
    resolveRequestedBuildingEra('X_BronzeAge_Test', null, 'ModernEra'),
    'BronzeAge'
  );
});

test('records the FoE CDN locale when the metadata name is already localized', () => {
  const definition = normalizeBuildingDefinition(
    {
      id: 'R_BronzeAge_LocalizedTest',
      name: 'Локалізована грою назва',
      width: 2,
      length: 2,
      era: 'BronzeAge',
    },
    {
      entityId: 'R_BronzeAge_LocalizedTest',
      locale: 'uk',
      sourceUrl: 'https://foeru.innogamescdn.com/start/metadata?id=building_entity_test',
    }
  );

  assert.equal(definition.name, 'Локалізована грою назва');
  assert.equal(definition.nameLocale, 'ru');
  assert.equal(definition.sourceLocale, 'ru');
});

test('normalizes modern components with a localized name, AllAge footprint/type, and exact-era bonuses', () => {
  const entityId = 'S_Special_ModernEra_MetadataTest';
  const definition = normalizeBuildingDefinition(
    {
      id: entityId,
      name: {
        en: 'Modern test building',
        uk: 'Сучасна тестова будівля',
      },
      era: 'ModernEra',
      components: {
        AllAge: {
          placement: { size: { x: 5, y: 4 } },
          tags: {
            tags: [{ tag: 'buildingType', buildingType: 'special' }],
          },
        },
        ModernEra: {
          boosts: {
            type: 'boosts',
            boosts: [
              {
                __class__: 'BoostHint',
                type: 'att_boost_attacker',
                value: 33,
                targetedFeature: 'guild_battleground',
                onlyWhenMotivated: true,
                condition: { type: 'motivated' },
              },
              {
                __class__: 'BoostHint',
                type: 'ignored_null_value',
                value: null,
              },
            ],
          },
          happiness: { provided: 40 },
        },
        FutureEra: {
          boosts: {
            boosts: [
              {
                __class__: 'BoostHint',
                type: 'att_boost_attacker',
                value: 99,
              },
            ],
          },
        },
      },
    },
    { entityId, locale: 'uk-UA', playerEra: 'FutureEra' }
  );

  assert.equal(definition.name, 'Сучасна тестова будівля');
  assert.equal(definition.nameLocale, 'uk');
  assert.equal(definition.type, 'special');
  assert.equal(definition.width, 5);
  assert.equal(definition.length, 4);
  assert.equal(definition.era, 'ModernEra');
  assert.equal(definition.componentEra, 'ModernEra');
  assert.equal(definition.happiness, 40);
  assert.deepEqual(definition.bonuses, [
    {
      type: 'att_boost_attacker',
      value: 33,
      targetedFeature: 'guild_battleground',
      onlyWhenMotivated: true,
      condition: 'motivated',
    },
  ]);
});

test('uses the nearest non-newer component era for a MultiAge building', () => {
  const entityId = 'S_MultiAge_NearestEraTest';
  const definition = normalizeBuildingDefinition(
    {
      id: entityId,
      name: 'Multi-age test building',
      components: {
        AllAge: {
          placement: { size: { x: 3, y: 2 } },
        },
        IndustrialAge: {
          metadata: { buildingType: 'production' },
          boosts: { boosts: [{ type: 'coin_production', value: 7 }] },
        },
        FutureEra: {
          boosts: { boosts: [{ type: 'coin_production', value: 15 }] },
        },
      },
    },
    { entityId, playerEra: 'ModernEra', locale: 'en' }
  );

  assert.equal(definition.era, 'IndustrialAge');
  assert.equal(definition.componentEra, 'IndustrialAge');
  assert.equal(definition.variantKey, `${entityId}@IndustrialAge`);
  assert.equal(definition.type, 'production');
  assert.deepEqual(definition.bonuses, [
    {
      type: 'coin_production',
      value: 7,
      targetedFeature: 'all',
      onlyWhenMotivated: false,
      condition: null,
    },
  ]);

  const futureDefinition = normalizeBuildingDefinition(
    {
      id: entityId,
      name: 'Multi-age test building',
      components: {
        AllAge: { placement: { size: { x: 3, y: 2 } } },
        IndustrialAge: {
          boosts: { boosts: [{ type: 'coin_production', value: 7 }] },
        },
        FutureEra: {
          boosts: { boosts: [{ type: 'coin_production', value: 15 }] },
        },
      },
    },
    { entityId, playerEra: 'FutureEra', locale: 'en' }
  );
  assert.equal(futureDefinition.variantKey, `${entityId}@FutureEra`);
  assert.equal(futureDefinition.bonuses[0].value, 15);
});

test('normalizes a legacy flat building definition', () => {
  const entityId = 'R_Residential_IndustrialAge_LegacyTest';
  const definition = normalizeBuildingDefinition(
    {
      id: entityId,
      name: 'Legacy residence',
      description: 'Legacy flat payload',
      type: 'residential',
      width: 3,
      length: 2,
      provided_happiness: '17',
      points: 100,
      requirements: {
        min_era: 'IndustrialAge',
        tech_id: 'industrial_housing',
      },
      bonuses: [
        {
          __class__: 'BuildingBoostHint',
          type: 'population',
          value: '120',
          targetedFeature: 'city',
        },
      ],
    },
    { entityId, locale: 'en-GB' }
  );

  assert.equal(definition.name, 'Legacy residence');
  assert.equal(definition.description, 'Legacy flat payload');
  assert.equal(definition.type, 'residential');
  assert.equal(definition.width, 3);
  assert.equal(definition.length, 2);
  assert.equal(definition.era, 'IndustrialAge');
  assert.equal(definition.componentEra, null);
  assert.equal(definition.happiness, 17);
  assert.equal(definition.points, 100);
  assert.equal(definition.techId, 'industrial_housing');
  assert.deepEqual(definition.bonuses, [
    {
      type: 'population',
      value: 120,
      targetedFeature: 'city',
      onlyWhenMotivated: false,
      condition: null,
    },
  ]);
});

test('keeps AllAge buildings on AllAge and ignores era-specific components', () => {
  const entityId = 'D_AllAge_StaticTest';
  const definition = normalizeBuildingDefinition(
    {
      id: entityId,
      name: 'All-age test building',
      era: 'FutureEra',
      components: {
        AllAge: {
          placement: { size: { x: 2, y: 2 } },
          metadata: { buildingType: 'decoration' },
          boosts: { boosts: [{ type: 'happiness', value: 10 }] },
        },
        ModernEra: {
          boosts: { boosts: [{ type: 'happiness', value: 50 }] },
        },
      },
    },
    { entityId, playerEra: 'ModernEra' }
  );

  assert.equal(definition.era, 'AllAge');
  assert.equal(definition.componentEra, null);
  assert.equal(definition.type, 'decoration');
  assert.equal(definition.width, 2);
  assert.equal(definition.length, 2);
  assert.deepEqual(definition.bonuses, [
    {
      type: 'happiness',
      value: 10,
      targetedFeature: 'all',
      onlyWhenMotivated: false,
      condition: null,
    },
  ]);
});

test('unwraps a nested metadata wrapper keyed by building_entity id', () => {
  const entityId = 'D_Decoration_BronzeAge_WrappedTest';
  const rawDefinition = {
    name: { en: 'Wrapped decoration' },
    type: 'decoration',
    width: 2,
    length: 1,
    era: 'BronzeAge',
  };
  const payload = {
    metadata: {
      data: {
        [`building_entity_${entityId}`]: rawDefinition,
      },
    },
  };

  assert.equal(unwrapBuildingDefinition(payload, entityId), rawDefinition);

  const definition = normalizeBuildingDefinition(payload, {
    entityId,
    locale: 'en',
  });
  assert.equal(definition.id, entityId);
  assert.equal(definition.name, 'Wrapped decoration');
  assert.equal(definition.width, 2);
  assert.equal(definition.length, 1);
});

test('returns null when the building payload is absent', () => {
  assert.equal(normalizeBuildingDefinition(null, { entityId: 'missing' }), null);
  assert.equal(normalizeBuildingDefinition(undefined, { entityId: 'missing' }), null);
  assert.equal(unwrapBuildingDefinition(null, 'missing'), null);
});
