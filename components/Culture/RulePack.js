// RulePack.js

export const piratesRulePack = {
  rulePackVersion: 'pirates_v1.3',
  settlementType: 'pirates',

  objectives: {
    primary: 'min_time_to_finish',
    secondary: ['min_economy_idle_time'],
    constraints: {
      diamondsAllowed: false,
      ignoreCurrencies: ['coins', 'supplies']
    }
  },

  economy: {
    functionalResources: [
      'time',
      'doubloons',
      'fish',
      'spice',
      'rum',
      'cannons',
      'workforce',
      'diplomacy',
      'pickaxe'
    ],
    rules: {
      workforceHardCap: {
        formula: 'workforceUsed <= workforceProvided',
        onViolation: 'action_not_allowed'
      }
    }
  },

  productionTemplates: {
    standard_goods_production_v1: {
      roadsRequired: false,
      recipes: [
        { durationMin: 300, costDoubloons: 1000, output: 5 },
        { durationMin: 600, costDoubloons: 2000, output: 10 },
        { durationMin: 1200, costDoubloons: 4000, output: 20 }
      ],
      randomBonus: { chance: 0.07, multiplier: 4 }
    }
  },

  unlockLogic: {
    alwaysUnlockedBuildings: ['hammock_place', 'fishery', 'small_pier'],
    defaultPolicy: 'requires_advancement_unlocked',
    advancementStatusSource: 'runState.tech.nodes[]',
    advancementUnlockedValue: 'unlocked',
    resolveBuildingToAdvancement: 'techTree.advancementsCatalog[].unlocks',
    ifBuildingHasNoUnlockEntry: 'error'
  },

  mechanics: {
    jobStorage: {
      mode: 'per_instance',
      path: 'runState.placedBuildings[].job',
      oneJobPerInstance: true
    },
    passiveCoin: {
      storage: 'single_cycle',
      timerPath: 'runState.placedBuildings[].passive.coin'
    },
    obstacles: {
      blocksTiles: true
    }
  },

  deletePolicy: {
    ifActiveJobRunning: 'action_not_allowed'
  },

  actionsCatalog: [
    {
      type: 'build',
      human: 'Побудувати будівлю на вільних клітинках у відкритому секторі',
      requires: [
        'building_unlocked',
        'sector_is_open',
        'tiles_are_free',
        'workforce_cap_ok'
      ],
      effects: [
        'adds_building_instance',
        'updates_workforceProvided_and_used',
        'updates_diplomacy'
      ]
    },
    {
      type: 'move',
      human: 'Перемістити вже побудовану будівлю на інше місце',
      requires: [
        'instance_exists',
        'sector_is_open',
        'tiles_are_free',
        'tiles_not_blocked_by_obstacle'
      ],
      effects: ['updates_building_instance_position']
    },
    {
      type: 'delete',
      human: 'Видалити вже побудовану будівлю',
      requires: [
        'instance_exists',
        'no_active_job_running_on_instance'
      ],
      effects: [
        'removes_building_instance',
        'updates_workforceProvided_and_used',
        'updates_diplomacy',
        'clears_any_passive_timer_state_if_exists'
      ]
    },
    {
      type: 'start_production',
      human: 'Запустити виробництво на будівлі (coin active або goods)',
      requires: [
        'instance_exists',
        'building_has_active_mode_or_template',
        'no_active_job_running_on_instance',
        'enough_inputs'
      ],
      effects: [
        'creates_job_with_startedAt_endsAt',
        'subtracts_inputs_now'
      ]
    },
    {
      type: 'collect',
      human: 'Зібрати готову продукцію (або пасивні дублони з житла)',
      requires: [
        'instance_exists',
        'job_or_timer_is_ready'
      ],
      effects: [
        'adds_outputs_to_resources',
        'updates_lifetime_collected_stats',
        'clears_job_or_resets_passive_timer'
      ]
    },
    {
      type: 'unlock_advancement',
      human: 'Відкрити технологію (advancement) за товари та з порогом дипломатії',
      requires: [
        'enough_diplomacy',
        'has_goods_cost',
        'prereqs_met_if_any'
      ],
      effects: [
        'sets_advancement_status_unlocked',
        'subtracts_goods_cost'
      ]
    },
    {
      type: 'unlock_sector',
      human: 'Відкрити новий сектор поруч (по стороні) і заплатити одним типом товару',
      requires: [
        'sector_is_locked',
        'adjacent_side_only_to_open_sector',
        'has_payment_goods_choose_one_type'
      ],
      effects: [
        'adds_sector_to_openedSectors',
        'subtracts_goods_payment'
      ]
    },
    {
      type: 'clear_obstacle',
      human: 'Прибрати перешкоду киркою, звільнивши клітинки',
      requires: [
        'obstacle_exists',
        'obstacle_is_in_open_sector',
        'has_pickaxe'
      ],
      effects: [
        'removes_obstacle',
        'subtracts_pickaxe'
      ]
    }
  ],

  buildings: {
    residential: [
      {
        id: 'hammock_place',
        name: 'Місце для гамака',
        category: 'residential',
        size: { w: 2, h: 2 },
        roadsRequired: false,
        workforceProvided: 18,
        workforceRequired: 0,
        diplomacyProvided: 0,
        buildTimeSec: 5,
        buildCostIgnored: true,
        coinOutput: {
          currency: 'doubloons',
          mode: 'passive',
          storage: 'single_cycle',
          recipes: [{ durationMin: 300, output: 129 }]
        }
      },
      {
        id: 'small_shed',
        name: 'Невеликий сарай',
        category: 'residential',
        size: { w: 3, h: 3 },
        roadsRequired: false,
        workforceProvided: 62,
        workforceRequired: 0,
        diplomacyProvided: 0,
        buildTimeSec: 3600,
        buildCostIgnored: true,
        coinOutput: {
          currency: 'doubloons',
          mode: 'passive',
          storage: 'single_cycle',
          recipes: [{ durationMin: 600, output: 543 }]
        }
      },
      {
        id: 'barracks',
        name: 'Казарми',
        category: 'residential',
        size: { w: 4, h: 4 },
        roadsRequired: false,
        workforceProvided: 174,
        workforceRequired: 0,
        diplomacyProvided: 0,
        buildTimeSec: 18000,
        buildCostIgnored: true,
        coinOutput: {
          currency: 'doubloons',
          mode: 'passive',
          storage: 'single_cycle',
          recipes: [{ durationMin: 1200, output: 2165 }]
        }
      }
    ],

    coin: [
      {
        id: 'small_cutter',
        name: 'Малий парусник',
        category: 'coin',
        size: { w: 2, h: 2 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 17,
        diplomacyProvided: 32,
        buildTimeSec: 3600,
        buildCostIgnored: true,
        coinOutput: {
          currency: 'doubloons',
          mode: 'active',
          recipes: [
            { durationMin: 5, output: 21 },
            { durationMin: 15, output: 50 },
            { durationMin: 60, output: 150 },
            { durationMin: 300, output: 399 },
            { durationMin: 600, output: 598 },
            { durationMin: 1200, output: 1195 }
          ]
        }
      },
      {
        id: 'red_sails_brig',
        name: 'Бриг під червоними вітрилами',
        category: 'coin',
        size: { w: 4, h: 3 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 51,
        diplomacyProvided: 192,
        buildTimeSec: 3600,
        buildCostIgnored: true,
        coinOutput: {
          currency: 'doubloons',
          mode: 'active',
          recipes: [
            { durationMin: 5, output: 84 },
            { durationMin: 15, output: 201 },
            { durationMin: 60, output: 601 },
            { durationMin: 300, output: 1601 },
            { durationMin: 600, output: 2401 },
            { durationMin: 1200, output: 4802 }
          ]
        }
      },
      {
        id: 'blackwater_galleon',
        name: 'Темноводний галеон',
        category: 'coin',
        size: { w: 5, h: 3 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 63,
        diplomacyProvided: 360,
        buildTimeSec: 18000,
        buildCostIgnored: true,
        coinOutput: {
          currency: 'doubloons',
          mode: 'active',
          recipes: [
            { durationMin: 5, output: 120 },
            { durationMin: 15, output: 288 },
            { durationMin: 60, output: 863 },
            { durationMin: 300, output: 2301 },
            { durationMin: 600, output: 3151 },
            { durationMin: 1200, output: 6901 }
          ]
        }
      }
    ],

    goods: [
      {
        id: 'fishery',
        name: 'Рибак',
        category: 'goods',
        produces: 'fish',
        size: { w: 4, h: 3 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 36,
        diplomacyProvided: 0,
        templateRef: 'standard_goods_production_v1',
        buildCostIgnored: true
      },
      {
        id: 'spice_market',
        name: 'Ринок спецій',
        category: 'goods',
        produces: 'spice',
        size: { w: 3, h: 3 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 45,
        diplomacyProvided: 0,
        templateRef: 'standard_goods_production_v1',
        buildCostIgnored: true
      },
      {
        id: 'rum_distillery',
        name: 'Ромова винокурня',
        category: 'goods',
        produces: 'rum',
        size: { w: 3, h: 5 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 27,
        diplomacyProvided: 0,
        templateRef: 'standard_goods_production_v1',
        buildCostIgnored: true
      },
      {
        id: 'cannon_builder',
        name: 'Будівник гармат',
        category: 'goods',
        produces: 'cannons',
        size: { w: 4, h: 4 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 24,
        diplomacyProvided: 0,
        templateRef: 'standard_goods_production_v1',
        buildCostIgnored: true
      }
    ],

    diplomacy: [
      {
        id: 'small_pier',
        name: 'Маленький причал',
        category: 'diplomacy',
        size: { w: 1, h: 1 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 0,
        diplomacyProvided: 8,
        buildTimeSec: 5,
        buildCostIgnored: true
      },
      {
        id: 'long_pier',
        name: 'Довгий причал',
        category: 'diplomacy',
        size: { w: 1, h: 3 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 0,
        diplomacyProvided: 48,
        buildTimeSec: 1800,
        buildCostIgnored: true
      },
      {
        id: 'wide_pier',
        name: 'Широкий причал',
        category: 'diplomacy',
        size: { w: 3, h: 1 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 0,
        diplomacyProvided: 48,
        buildTimeSec: 1800,
        buildCostIgnored: true
      },
      {
        id: 'large_pier',
        name: 'Великий пірс',
        category: 'diplomacy',
        size: { w: 3, h: 3 },
        roadsRequired: false,
        workforceProvided: 0,
        workforceRequired: 0,
        diplomacyProvided: 216,
        buildTimeSec: 3600,
        buildCostIgnored: true
      }
    ]
  },

  map: {
    sectorTileSize: { w: 4, h: 4 },
    totalSectors: 28,
    allSectors: [
      'A1:D4',
      'E1:H4',
      'I1:L4',
      'A5:D8',
      'E5:H8',
      'I5:L8',
      'A9:D12',
      'E9:H12',
      'I9:L12',
      'M9:P12',
      'A13:D16',
      'E13:H16',
      'I13:L16',
      'M13:P16',
      'Q13:T16',
      'A17:D20',
      'E17:H20',
      'I17:L20',
      'M17:P20',
      'Q17:T20',
      'A21:D24',
      'E21:H24',
      'I21:L24',
      'M21:P24',
      'Q21:T24',
      'E25:H28',
      'I25:L28',
      'M25:P28'
    ],
    startOpenSectors: [
      'M9:P12',
      'M13:P16',
      'Q13:T16',
      'M17:P20',
      'Q17:T20'
    ],
    unlockRules: {
      adjacency: 'side_only',
      diagonalCounts: false
    },
    maxExpansionsModelled: 7,
    expansionCostByIndex: {
      1: { fish: 10, spice: 10, rum: 10, cannons: 10 },
      2: { fish: 20, spice: 10, rum: 10, cannons: 10 },
      3: { fish: 30, spice: 20, rum: 10, cannons: 10 },
      4: { fish: 60, spice: 40, rum: 40, cannons: 10 },
      5: { fish: 90, spice: 60, rum: 40, cannons: 20 },
      6: { fish: 99, spice: 90, rum: 60, cannons: 40 },
      7: { fish: 107, spice: 99, rum: 90, cannons: 60 }
    },
    expansionMechanics: {
      initialExpansions: {
        count: 4,
        triggerThreshold: 10,
        autoUnlockOnThreshold: true,
        forcedGoodsSequence: ['fish', 'spice', 'rum', 'cannons'],
        description: 'Перші 4 додаткові сектори відкриваються автоматично, щойно з’являється 10 одиниць відповідного товару. Порядок жорстко фіксований: fish -> spice -> rum -> cannons.'
      },
      advancedExpansions: {
        applyFromExpansionIndex: 5,
        reserveGoodsForFutureTech: true,
        reserveScope: 'all_remaining_advancements',
        surplusFormula: 'surplus = currentGoods - reservedForRemainingAdvancements',
        unlockCondition: 'surplus >= sectorCostForChosenGood',
        unlockPolicy: 'mandatory_if_surplus',
        chooseGoodPolicy: 'highest_sector_cost_among_eligible_goods',
        postUnlockPolicy: {
          buildImmediately: true,
          disallowLeavingSectorEmpty: true,
          description: 'Якщо сектор відкрито через надлишок товару, його не можна залишати порожнім: агент повинен одразу почати забудову.'
        },
        description: 'Починаючи з 5-го розширення, кожен товар спочатку резервується під усі ще не відкриті технології. Якщо після цього є надлишок, достатній для оплати сектора, сектор відкривається обов’язково. Якщо підходить кілька товарів, обирається той, для якого вартість відкриття сектора більша.'
      },
      paymentRule: 'choose_one_goods_type_only',
      expansionIndexFormula: 'openedSectors.length - startOpenSectors.length + 1',
      unlockActionName: 'unlock_sector'
    }
  },

  techTree: {
    requiredDiplomacyThresholds: [32, 120, 195, 280, 375, 480, 595, 720, 855, 1000],
    costGoodsSource: 'runState.tech.nodes[].costGoods',
    paymentRules: {
      allowedGoodsPolicy: 'all_unlocked_goods',
      description: 'Кожну технологію можна оплачувати будь-якою комбінацією товарів, виробництво яких уже відкрите на момент оплати.'
    },
    validation: {
      enforceTotalGoodsCost: true,
      rule: 'sum(costGoods) == totalGoodsCost'
    },
    advancementsCatalog: [
      {
        id: 'adv_01',
        name: 'Малий парусник',
        requiredDiplomacy: 32,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 10,
        allowedGoods: ['fish'],
        unlocks: [{ type: 'building', buildingId: 'small_cutter' }]
      },
      {
        id: 'adv_02',
        name: 'Ринок спецій',
        requiredDiplomacy: 120,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 25,
        allowedGoods: ['fish'],
        unlocks: [{ type: 'building', buildingId: 'spice_market' }]
      },
      {
        id: 'adv_03',
        name: 'Невеликий сарай',
        requiredDiplomacy: 195,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 80,
        allowedGoods: ['fish', 'spice'],
        unlocks: [{ type: 'building', buildingId: 'small_shed' }]
      },
      {
        id: 'adv_04',
        name: 'Причали',
        requiredDiplomacy: 280,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 125,
        allowedGoods: ['fish', 'spice'],
        unlocks: [
          { type: 'building', buildingId: 'long_pier' },
          { type: 'building', buildingId: 'wide_pier' }
        ]
      },
      {
        id: 'adv_05',
        name: 'Ромова винокурня',
        requiredDiplomacy: 375,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 170,
        allowedGoods: ['fish', 'spice'],
        unlocks: [{ type: 'building', buildingId: 'rum_distillery' }]
      },
      {
        id: 'adv_06',
        name: 'Бриг з червоними вітрилами',
        requiredDiplomacy: 480,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 200,
        allowedGoods: ['fish', 'spice', 'rum'],
        unlocks: [{ type: 'building', buildingId: 'red_sails_brig' }]
      },
      {
        id: 'adv_07',
        name: 'Будівник гармат',
        requiredDiplomacy: 595,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 230,
        allowedGoods: ['fish', 'spice', 'rum'],
        unlocks: [{ type: 'building', buildingId: 'cannon_builder' }]
      },
      {
        id: 'adv_08',
        name: 'Казарми',
        requiredDiplomacy: 720,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 260,
        allowedGoods: ['fish', 'spice', 'rum', 'cannons'],
        unlocks: [{ type: 'building', buildingId: 'barracks' }]
      },
      {
        id: 'adv_09',
        name: 'Темноводний галеон',
        requiredDiplomacy: 855,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 290,
        allowedGoods: ['fish', 'spice', 'rum', 'cannons'],
        unlocks: [{ type: 'building', buildingId: 'blackwater_galleon' }]
      },
      {
        id: 'adv_10',
        name: 'Великий пірс',
        requiredDiplomacy: 1000,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 320,
        allowedGoods: ['fish', 'spice', 'rum', 'cannons'],
        unlocks: [{ type: 'building', buildingId: 'large_pier' }]
      }
    ]
  },

  spatialRules: {
    roadsRequired: false,
    sectorObstacles: {
      countPerLockedSector: 1,
      sizeOptions: [{ w: 2, h: 1 }, { w: 1, h: 2 }],
      coords: { type: 'local_in_sector_4x4', xRange: [0, 3], yRange: [0, 3] },
      providedIn: 'runState.sectorObstaclesStatic'
    }
  },

  validation: {
    requiredPaths: [
      'runState.progress.openedSectors',
      'runState.progress.questLineId',
      'runState.progress.currentQuestId',
      'runState.resources.doubloons',
      'runState.resources.goods.fish',
      'runState.resources.goods.spice',
      'runState.resources.goods.rum',
      'runState.resources.goods.cannons',
      'runState.resources.workforce.provided',
      'runState.resources.workforce.used',
      'runState.resources.diplomacy',
      'runState.resources.items.pickaxe',
      'runState.stats.collected.doubloons',
      'runState.stats.collected.goods.fish',
      'runState.stats.collected.goods.spice',
      'runState.stats.collected.goods.rum',
      'runState.stats.collected.goods.cannons',
      'runState.tech.nodes',
      'runState.placedBuildings',
      'runState.sectorObstaclesStatic'
    ]
  },

  initialStateTemplate: {
    progress: {
      openedSectors: [
        'M9:P12',
        'M13:P16',
        'Q13:T16',
        'M17:P20',
        'Q17:T20'
      ],
      questLineId: 'pirates_main_questline',
      currentQuestId: 'quest_01',
      completedQuestIds: []
    },
    resources: {
      doubloons: 0,
      goods: {
        fish: 0,
        spice: 0,
        rum: 0,
        cannons: 0
      },
      workforce: {
        provided: 0,
        used: 0
      },
      diplomacy: 0,
      items: {
        pickaxe: 0
      }
    },
    stats: {
      collected: {
        doubloons: 0,
        goods: {
          fish: 0,
          spice: 0,
          rum: 0,
          cannons: 0
        }
      }
    },
    placedBuildings: [],
    tech: {
      nodes: []
    },
    sectorObstaclesStatic: {}
  },

  winCondition: {
    primary: {
      type: 'complete_quest_line',
      questLineId: 'pirates_main_questline',
      description: 'Завершення всієї лінійки квестів Pirates Settlement'
    },
    secondary: {
      type: 'reach_diplomacy_and_advancement',
      targetDiplomacy: 1000,
      requiredAdvancementId: 'adv_10'
    },
    description: 'Перемога досягається після завершення лінійки квестів. Додатковий показник — 1000 дипломатії та великий пірс.'
  },

  questLines: [
    {
      id: 'pirates_main_questline',
      name: 'Основна піратська пригода',
      description: 'Пройди шлях від гамаків до великого пірсу і накопич ресурси',
      quests: [
        {
          id: 'quest_01',
          order: 1,
          name: 'Початок з гамаком',
          description: 'Побудувати 2 місця для гамака',
          requires: [{ type: 'build_count', buildingId: 'hammock_place', count: 2 }],
          rewards: []
        },
        {
          id: 'quest_02',
          order: 2,
          name: 'Причали на старті',
          description: 'Побудувати 4 маленькі причали',
          requires: [{ type: 'build_count', buildingId: 'small_pier', count: 4 }],
          rewards: []
        },
        {
          id: 'quest_03',
          order: 3,
          name: 'Перша риба',
          description: 'Побудувати 1 рибалку',
          requires: [{ type: 'build_count', buildingId: 'fishery', count: 1 }],
          rewards: []
        },
        {
          id: 'quest_04',
          order: 4,
          name: 'Дипломатія та риба',
          description: 'Отримати 32 очки дипломатії та зібрати 10 риби',
          requires: [
            { type: 'resource_threshold', resource: 'diplomacy', min: 32 },
            { type: 'resource_collected', resource: 'fish', amount: 10 }
          ],
          rewards: []
        },
        {
          id: 'quest_05',
          order: 5,
          name: 'Малі парусники',
          description: 'Побудувати 2 малих парусники',
          requiredAdvancementId: 'adv_01',
          requires: [{ type: 'build_count', buildingId: 'small_cutter', count: 2 }],
          rewards: []
        },
        {
          id: 'quest_06',
          order: 6,
          name: 'Спеції на ринку',
          description: 'Побудувати ринок спецій',
          requiredAdvancementId: 'adv_02',
          requires: [{ type: 'build_count', buildingId: 'spice_market', count: 1 }],
          rewards: [
            {
              type: 'item',
              itemId: 'pickaxe',
              amount: 1,
              description: 'Кирка — дозволяє видалити одну перешкоду в відкритому секторі'
            }
          ]
        },
        {
          id: 'quest_07',
          order: 7,
          name: 'Перші спеції',
          description: 'Зібрати 10 спецій',
          requires: [{ type: 'resource_collected', resource: 'spice', amount: 10 }],
          rewards: []
        },
        {
          id: 'quest_08',
          order: 8,
          name: 'Житло розширюється',
          description: 'Побудувати 2 невеликі сараї',
          requiredAdvancementId: 'adv_03',
          requires: [{ type: 'build_count', buildingId: 'small_shed', count: 2 }],
          rewards: []
        },
        {
          id: 'quest_09',
          order: 9,
          name: 'Більші причали',
          description: 'Побудувати 2 довгих причали або 2 широких причали',
          requiredAdvancementId: 'adv_04',
          requires: [
            {
              type: 'build_count_or',
              options: [
                { buildingId: 'long_pier', count: 2 },
                { buildingId: 'wide_pier', count: 2 }
              ]
            }
          ],
          rewards: []
        },
        {
          id: 'quest_10',
          order: 10,
          name: 'Ромовий бізнес',
          description: 'Побудувати ромову винокурню',
          requiredAdvancementId: 'adv_05',
          requires: [{ type: 'build_count', buildingId: 'rum_distillery', count: 1 }],
          rewards: []
        },
        {
          id: 'quest_11',
          order: 11,
          name: 'Перший ром',
          description: 'Зібрати 20 рому',
          requires: [{ type: 'resource_collected', resource: 'rum', amount: 20 }],
          rewards: [
            {
              type: 'item',
              itemId: 'pickaxe',
              amount: 1,
              description: 'Кирка — дозволяє видалити одну перешкоду в відкритому секторі'
            }
          ]
        },
        {
          id: 'quest_12',
          order: 12,
          name: 'Червоні вітрила',
          description: 'Побудувати 2 бриги з червоними вітрилами',
          requiredAdvancementId: 'adv_06',
          requires: [{ type: 'build_count', buildingId: 'red_sails_brig', count: 2 }],
          rewards: []
        },
        {
          id: 'quest_13',
          order: 13,
          name: 'Гарматна справа',
          description: 'Побудувати будівельника гармат',
          requiredAdvancementId: 'adv_07',
          requires: [{ type: 'build_count', buildingId: 'cannon_builder', count: 1 }],
          rewards: []
        },
        {
          id: 'quest_14',
          order: 14,
          name: 'Гарматний запас',
          description: 'Зібрати 20 гармат',
          requires: [{ type: 'resource_collected', resource: 'cannons', amount: 20 }],
          rewards: []
        },
        {
          id: 'quest_15',
          order: 15,
          name: 'Казарми',
          description: 'Побудувати одну казарму',
          requiredAdvancementId: 'adv_08',
          requires: [{ type: 'build_count', buildingId: 'barracks', count: 1 }],
          rewards: [
            {
              type: 'item',
              itemId: 'pickaxe',
              amount: 1,
              description: 'Кирка — дозволяє видалити одну перешкоду в відкритому секторі'
            }
          ]
        },
        {
          id: 'quest_16',
          order: 16,
          name: 'Галеон',
          description: 'Побудувати один темноводний галеон',
          requiredAdvancementId: 'adv_09',
          requires: [{ type: 'build_count', buildingId: 'blackwater_galleon', count: 1 }],
          rewards: []
        },
        {
          id: 'quest_17',
          order: 17,
          name: 'Великий пірс',
          description: 'Побудувати один великий пірс',
          requiredAdvancementId: 'adv_10',
          requires: [{ type: 'build_count', buildingId: 'large_pier', count: 1 }],
          rewards: []
        },
        {
          id: 'quest_18',
          order: 18,
          name: 'Фінальний виклик',
          description: 'Мати 1200 дипломатії, зібрати 12000 дублонів, 10 риби, 10 спецій, 10 рому, 10 гармат',
          requires: [
            { type: 'resource_threshold', resource: 'diplomacy', min: 1200 },
            { type: 'resource_threshold', resource: 'doubloons', min: 12000 },
            { type: 'resource_threshold', resource: 'fish', min: 10 },
            { type: 'resource_threshold', resource: 'spice', min: 10 },
            { type: 'resource_threshold', resource: 'rum', min: 10 },
            { type: 'resource_threshold', resource: 'cannons', min: 10 }
          ],
          rewards: [],
          isFinal: true
        }
      ]
    }
  ]
};

export const vikingsRulePack = {
  rulePackVersion: 'vikings_map_only_v1',
  settlementType: 'vikings',
  status: 'map_only',
  map: {
    sectorTileSize: { w: 4, h: 4 },
    totalSectors: 25,
    allSectors: [
      'E1:H4',
      'I1:L4',
      'M1:P4',
      'Q1:T4',
      'A5:D8',
      'E5:H8',
      'I5:L8',
      'M5:P8',
      'Q5:T8',
      'A9:D12',
      'E9:H12',
      'I9:L12',
      'M9:P12',
      'Q9:T12',
      'U9:X12',
      'A13:D16',
      'E13:H16',
      'I13:L16',
      'M13:P16',
      'Q13:T16',
      'U13:X16',
      'E17:H20',
      'I17:L20',
      'M17:P20',
      'Q17:T20'
    ],
    startOpenSectors: ['I5:L8', 'M5:P8', 'I9:L12', 'M9:P12'],
    unlockRules: { adjacency: 'side_only', diagonalCounts: false }
  },

  techTree: {
    requiredDiplomacyThresholds: [55, 120, 195, 280, 375, 480, 595, 720, 855, 1000],
    advancementsCatalog: [
      {
        id: 'adv_01',
        name: 'Святиня',
        requiredDiplomacy: 55,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 10,
        allowedGoods: ['axes']
      },
      {
        id: 'adv_02',
        name: 'Медоварня',
        requiredDiplomacy: 120,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 34,
        allowedGoods: ['axes']
      },
      {
        id: 'adv_03',
        name: 'Хатина',
        requiredDiplomacy: 195,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 52,
        allowedGoods: ['axes', 'mead']
      },
      {
        id: 'adv_04',
        name: 'Мисливець на звірів',
        requiredDiplomacy: 280,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 69,
        allowedGoods: ['axes', 'mead']
      },
      {
        id: 'adv_05',
        name: 'Тотем клану',
        requiredDiplomacy: 375,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 86,
        allowedGoods: ['axes', 'mead', 'horns']
      },
      {
        id: 'adv_06',
        name: 'Базар',
        requiredDiplomacy: 480,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 103,
        allowedGoods: ['axes', 'mead', 'horns']
      },
      {
        id: 'adv_07',
        name: 'Ферма вовни',
        requiredDiplomacy: 595,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 120,
        allowedGoods: ['axes', 'mead', 'horns']
      },
      {
        id: 'adv_08',
        name: 'Будинок клану',
        requiredDiplomacy: 720,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 137,
        allowedGoods: ['axes', 'mead', 'horns', 'wool']
      },
      {
        id: 'adv_09',
        name: 'Стара верба',
        requiredDiplomacy: 855,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 155,
        allowedGoods: ['axes', 'mead', 'horns', 'wool']
      },
      {
        id: 'adv_10',
        name: 'Медова зала',
        requiredDiplomacy: 1000,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 172,
        allowedGoods: ['axes', 'mead', 'horns', 'wool']
      }
    ]
  }
};

export const aztecsRulePack = {
  rulePackVersion: 'aztecs_map_only_v1',
  settlementType: 'aztecs',
  status: 'map_only',
  map: {
    sectorTileSize: { w: 4, h: 4 },
    totalSectors: 30,
    allSectors: [
      'I1:L4',
      'M1:P4',
      'Q1:T4',
      'E5:H8',
      'I5:L8',
      'M5:P8',
      'Q5:T8',
      'U5:X8',
      'E9:H12',
      'I9:L12',
      'M9:P12',
      'Q9:T12',
      'U9:X12',
      'A13:D16',
      'E13:H16',
      'I13:L16',
      'M13:P16',
      'Q13:T16',
      'U13:X16',
      'A17:D20',
      'E17:H20',
      'I17:L20',
      'M17:P20',
      'Q17:T20',
      'U17:X20',
      'E21:H24',
      'I21:L24',
      'M21:P24',
      'Q21:T24',
      'U21:X24'
    ],
    startOpenSectors: ['M9:P12', 'Q9:T12', 'U9:X12', 'M13:P16', 'Q13:T16', 'U13:X16'],
    unlockRules: { adjacency: 'side_only', diagonalCounts: false }
  },

  techTree: {
    requiredDiplomacyThresholds: [55, 120, 195, 280, 375, 480, 595, 720, 855, 1000],
    advancementsCatalog: [
      {
        id: 'adv_01',
        name: 'Проста Святиня',
        requiredDiplomacy: 55,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 15,
        allowedGoods: ['vegetables']
      },
      {
        id: 'adv_02',
        name: 'Вольєр Кетцалей',
        requiredDiplomacy: 120,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 30,
        allowedGoods: ['vegetables']
      },
      {
        id: 'adv_03',
        name: 'Житло яотегихуа',
        requiredDiplomacy: 195,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 60,
        allowedGoods: ['vegetables', 'headdresses']
      },
      {
        id: 'adv_04',
        name: 'Кукурузна ферма',
        requiredDiplomacy: 280,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 100,
        allowedGoods: ['vegetables', 'headdresses']
      },
      {
        id: 'adv_05',
        name: 'Декоративна статуя та Статуя з візерунком',
        requiredDiplomacy: 375,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 115,
        allowedGoods: ['vegetables', 'headdresses', 'corn']
      },
      {
        id: 'adv_06',
        name: 'Тешкоцинго',
        requiredDiplomacy: 480,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 140,
        allowedGoods: ['vegetables', 'headdresses', 'corn']
      },
      {
        id: 'adv_07',
        name: 'Майстерня каменаря',
        requiredDiplomacy: 595,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 160,
        allowedGoods: ['vegetables', 'headdresses', 'corn']
      },
      {
        id: 'adv_08',
        name: 'Палац Піллі',
        requiredDiplomacy: 720,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 185,
        allowedGoods: ['vegetables', 'headdresses', 'corn', 'stone_figures']
      },
      {
        id: 'adv_09',
        name: 'Камінь Сонця',
        requiredDiplomacy: 855,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 210,
        allowedGoods: ['vegetables', 'headdresses', 'corn', 'stone_figures']
      },
      {
        id: 'adv_10',
        name: 'Великий храм',
        requiredDiplomacy: 1000,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 230,
        allowedGoods: ['vegetables', 'headdresses', 'corn', 'stone_figures']
      }
    ]
  }
};

export const egyptiansRulePack = {
  rulePackVersion: 'egyptians_map_only_v1',
  settlementType: 'egyptians',
  status: 'map_only',
  map: {
    sectorTileSize: { w: 4, h: 4 },
    totalSectors: 41,
    allSectors: [
      'A1:D4',
      'E1:H4',
      'I1:L4',
      'M1:P4',
      'Q1:T4',
      'U1:X4',
      'Y1:AB4',
      'A5:D8',
      'E5:H8',
      'I5:L8',
      'M5:P8',
      'Q5:T8',
      'U5:X8',
      'Y5:AB8',
      'A9:D12',
      'E9:H12',
      'I9:L12',
      'M9:P12',
      'Q9:T12',
      'U9:X12',
      'Y9:AB12',
      'A13:D16',
      'E13:H16',
      'I13:L16',
      'M13:P16',
      'Q13:T16',
      'U13:X16',
      'Y13:AB16',
      'E17:H20',
      'I17:L20',
      'M17:P20',
      'Q17:T20',
      'U17:X20',
      'Y17:AB20',
      'M21:P24',
      'Q21:T24',
      'U21:X24',
      'Y21:AB24',
      'Q25:T28',
      'U25:X28',
      'Y25:AB28'
    ],
    startOpenSectors: [
      'A5:D8',
      'E5:H8',
      'I5:L8',
      'M5:P8',
      'A9:D12',
      'E9:H12',
      'I9:L12',
      'M9:P12'
    ],
    unlockRules: {
      adjacency: 'side_only',
      diagonalCounts: false
    }
  },

  techTree: {
    requiredDiplomacyThresholds: [60, 160, 250, 360, 480, 610, 750, 900, 1060, 1230, 1420, 1610, 1820],
    advancementsCatalog: [
      {
        id: 'adv_01',
        name: 'Статуя божества',
        requiredDiplomacy: 60,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 14,
        allowedGoods: ['barley']
      },
      {
        id: 'adv_02',
        name: 'Гончарня',
        requiredDiplomacy: 160,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 30,
        allowedGoods: ['barley']
      },
      {
        id: 'adv_03',
        name: 'Коліснична майстерня і багатоповерховий глиняний будинок',
        requiredDiplomacy: 250,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 50,
        allowedGoods: ['barley', 'pottery']
      },
      {
        id: 'adv_04',
        name: 'Вирощена пальма (північ) і вирощена пальма (схід)',
        requiredDiplomacy: 360,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 70,
        allowedGoods: ['barley', 'pottery']
      },
      {
        id: 'adv_05',
        name: 'Парковий ставок',
        requiredDiplomacy: 480,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 85,
        allowedGoods: ['barley', 'pottery']
      },
      {
        id: 'adv_06',
        name: 'Квіткова ферма',
        requiredDiplomacy: 610,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 100,
        allowedGoods: ['barley', 'pottery']
      },
      {
        id: 'adv_07',
        name: 'Красивий пальмовий сад (північ) і красивий пальмовий сад (схід)',
        requiredDiplomacy: 750,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 120,
        allowedGoods: ['barley', 'pottery', 'flowers']
      },
      {
        id: 'adv_08',
        name: 'Житловий квартал',
        requiredDiplomacy: 900,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 140,
        allowedGoods: ['barley', 'pottery', 'flowers']
      },
      {
        id: 'adv_09',
        name: 'Стійло для слонів',
        requiredDiplomacy: 1060,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 155,
        allowedGoods: ['barley', 'pottery', 'flowers']
      },
      {
        id: 'adv_10',
        name: 'Жертвопринесення',
        requiredDiplomacy: 1230,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 170,
        allowedGoods: ['barley', 'pottery', 'flowers']
      },
      {
        id: 'adv_11',
        name: 'Процесія',
        requiredDiplomacy: 1420,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 190,
        allowedGoods: ['barley', 'pottery', 'flowers', 'offerings']
      },
      {
        id: 'adv_12',
        name: 'Розкішний особняк та оазис',
        requiredDiplomacy: 1610,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 205,
        allowedGoods: ['barley', 'pottery', 'flowers', 'offerings']
      },
      {
        id: 'adv_13',
        name: 'Піраміда',
        requiredDiplomacy: 1820,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 220,
        allowedGoods: ['barley', 'pottery', 'flowers', 'offerings']
      }
    ]
  }
};

export const mongolsRulePack = {
  rulePackVersion: 'mongols_map_only_v1',
  settlementType: 'mongols',
  status: 'map_only',
  map: {
    sectorTileSize: { w: 4, h: 4 },
    totalSectors: 43,
    allSectors: [
      'A1:D4',
      'E1:H4',
      'I1:L4',
      'M1:P4',
      'Q1:T4',
      'U1:X4',
      'Y1:AB4',
      'A5:D8',
      'E5:H8',
      'I5:L8',
      'M5:P8',
      'Q5:T8',
      'U5:X8',
      'Y5:AB8',
      'A9:D12',
      'E9:H12',
      'I9:L12',
      'M9:P12',
      'Q9:T12',
      'U9:X12',
      'Y9:AB12',
      'A13:D16',
      'E13:H16',
      'I13:L16',
      'M13:P16',
      'Q13:T16',
      'U13:X16',
      'Y13:AB16',
      'A17:D20',
      'E17:H20',
      'I17:L20',
      'M17:P20',
      'Q17:T20',
      'U17:X20',
      'Y17:AB20',
      'E21:H24',
      'I21:L24',
      'M21:P24',
      'Q21:T24',
      'U21:X24',
      'I25:L28',
      'M25:P28',
      'Q25:T28'
    ],
    startOpenSectors: [
      'I5:L8',
      'M5:P8',
      'Q5:T8',
      'U5:X8',
      'I9:L12',
      'M9:P12',
      'Q9:T12',
      'U9:X12',
      'I13:L16',
      'M13:P16',
      'Q13:T16'
    ],
    unlockRules: { adjacency: 'side_only', diagonalCounts: false }
  },

  techTree: {
    requiredDiplomacyThresholds: [102, 214, 307, 400, 540, 700, 870, 1050, 1260],
    advancementsCatalog: [
      {
        id: 'adv_01',
        name: 'Водний канал',
        requiredDiplomacy: 102,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 5,
        allowedGoods: ['basmati_rice']
      },
      {
        id: 'adv_02',
        name: 'Ткачі сарі',
        requiredDiplomacy: 214,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 20,
        allowedGoods: ['basmati_rice']
      },
      {
        id: 'adv_03',
        name: 'Шанті гар',
        requiredDiplomacy: 307,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 50,
        allowedGoods: ['basmati_rice', 'sari']
      },
      {
        id: 'adv_04',
        name: 'Шатри',
        requiredDiplomacy: 400,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 85,
        allowedGoods: ['basmati_rice', 'sari']
      },
      {
        id: 'adv_05',
        name: 'Лавка спецій',
        requiredDiplomacy: 540,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 130,
        allowedGoods: ['basmati_rice', 'sari']
      },
      {
        id: 'adv_06',
        name: 'Балдахін',
        requiredDiplomacy: 700,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 160,
        allowedGoods: ['basmati_rice', 'sari', 'spices']
      },
      {
        id: 'adv_07',
        name: 'Лотосова квіткова ферма',
        requiredDiplomacy: 870,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 190,
        allowedGoods: ['basmati_rice', 'sari', 'spices']
      },
      {
        id: 'adv_08',
        name: 'Чарбаг',
        requiredDiplomacy: 1050,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 220,
        allowedGoods: ['basmati_rice', 'sari', 'spices', 'lotus']
      },
      {
        id: 'adv_09',
        name: 'Хавелі',
        requiredDiplomacy: 1260,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 250,
        allowedGoods: ['basmati_rice', 'sari', 'spices', 'lotus']
      }
    ]
  }
};

export const polynesiaRulePack = {
  rulePackVersion: 'polynesia_map_only_v1',
  settlementType: 'polynesia',
  status: 'map_only',
  map: {
    sectorTileSize: { w: 4, h: 4 },
    totalSectors: 24,
    allSectors: [
      'E1:H4',
      'I1:L4',
      'M1:P4',
      'A5:D8',
      'E5:H8',
      'I5:L8',
      'M5:P8',
      'Q5:T8',
      'A9:D12',
      'E9:H12',
      'I9:L12',
      'M9:P12',
      'Q9:T12',
      'E13:H16',
      'I13:L16',
      'M13:P16',
      'Q13:T16',
      'M17:P20',
      'Q17:T20',
      'U17:X20',
      'Y17:AB20',
      'Q21:T24',
      'U21:X24',
      'Y21:AB24'
    ],
    startOpenSectors: ['M13:P16', 'Q13:T16', 'M17:P20', 'Q17:T20'],
    unlockRules: { adjacency: 'side_only', diagonalCounts: false }
  },

  techTree: {
    requiredDiplomacyThresholds: [30, 120, 195, 280, 375, 480, 595, 720, 855, 1000],
    advancementsCatalog: [
      {
        id: 'adv_01',
        name: 'Танцювальна сцена',
        requiredDiplomacy: 30,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 5,
        allowedGoods: ['fresh_fish']
      },
      {
        id: 'adv_02',
        name: 'Пальмовий сад',
        requiredDiplomacy: 120,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 10,
        allowedGoods: ['fresh_fish']
      },
      {
        id: 'adv_03',
        name: 'Житло на палях',
        requiredDiplomacy: 195,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 40,
        allowedGoods: ['fresh_fish', 'coconut']
      },
      {
        id: 'adv_04',
        name: 'Мелодична статуя та Статуя Музики',
        requiredDiplomacy: 280,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 70,
        allowedGoods: ['fresh_fish', 'coconut']
      },
      {
        id: 'adv_05',
        name: 'Ферма кави',
        requiredDiplomacy: 375,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 95,
        allowedGoods: ['fresh_fish', 'coconut']
      },
      {
        id: 'adv_06',
        name: 'Суспільна кухня',
        requiredDiplomacy: 480,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 110,
        allowedGoods: ['fresh_fish', 'coconut', 'coffee']
      },
      {
        id: 'adv_07',
        name: 'Будівельник катамаранів',
        requiredDiplomacy: 595,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 135,
        allowedGoods: ['fresh_fish', 'coconut', 'coffee']
      },
      {
        id: 'adv_08',
        name: 'Сімейний будинок',
        requiredDiplomacy: 720,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 150,
        allowedGoods: ['fresh_fish', 'coconut', 'coffee', 'catamarans']
      },
      {
        id: 'adv_09',
        name: 'Природний тотем',
        requiredDiplomacy: 855,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 170,
        allowedGoods: ['fresh_fish', 'coconut', 'coffee', 'catamarans']
      },
      {
        id: 'adv_10',
        name: 'Хижа королівського сховища',
        requiredDiplomacy: 1000,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 190,
        allowedGoods: ['fresh_fish', 'coconut', 'coffee', 'catamarans']
      }
    ]
  }
};

export const japaneseRulePack = {
  rulePackVersion: 'japanese_map_only_v1',
  settlementType: 'japanese',
  status: 'map_only',
  map: {
    sectorTileSize: { w: 4, h: 4 },
    totalSectors: 24,
    allSectors: [
      'Q1:T4',
      'U1:X4',
      'M5:P8',
      'Q5:T8',
      'U5:X8',
      'M9:P12',
      'Q9:T12',
      'U9:X12',
      'E13:H16',
      'I13:L16',
      'M13:P16',
      'Q13:T16',
      'U13:X16',
      'A17:D20',
      'E17:H20',
      'I17:L20',
      'M17:P20',
      'Q17:T20',
      'U17:X20',
      'A21:D24',
      'E21:H24',
      'I21:L24',
      'M21:P24',
      'Q21:T24'
    ],
    startOpenSectors: ['Q13:T16', 'U13:X16', 'Q17:T20', 'U17:X20'],
    unlockRules: { adjacency: 'side_only', diagonalCounts: false }
  },

  techTree: {
    requiredDiplomacyThresholds: [30, 60, 100, 140, 198, 254, 315, 381, 453, 530],
    advancementsCatalog: [
      {
        id: 'adv_01',
        name: 'Святиня Сінто',
        requiredDiplomacy: 30,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 10,
        allowedGoods: ['soy']
      },
      {
        id: 'adv_02',
        name: 'Галерея',
        requiredDiplomacy: 60,
        goodsCostPolicy: 'fixed',
        totalGoodsCost: 35,
        allowedGoods: ['soy']
      },
      {
        id: 'adv_03',
        name: 'Будинок Сьон-дзукурі',
        requiredDiplomacy: 100,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 60,
        allowedGoods: ['soy', 'paintings']
      },
      {
        id: 'adv_04',
        name: 'Ворота торі та Священні ворота торі',
        requiredDiplomacy: 140,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 75,
        allowedGoods: ['soy', 'paintings']
      },
      {
        id: 'adv_05',
        name: 'Зброяр',
        requiredDiplomacy: 198,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 100,
        allowedGoods: ['soy', 'paintings']
      },
      {
        id: 'adv_06',
        name: 'Чайний будиночок',
        requiredDiplomacy: 254,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 115,
        allowedGoods: ['soy', 'paintings', 'armor']
      },
      {
        id: 'adv_07',
        name: 'Майстерня інструментів',
        requiredDiplomacy: 315,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 130,
        allowedGoods: ['soy', 'paintings', 'armor']
      },
      {
        id: 'adv_08',
        name: 'Маєток Сьон-дзукурі',
        requiredDiplomacy: 381,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 150,
        allowedGoods: ['soy', 'paintings', 'armor', 'musical_instruments']
      },
      {
        id: 'adv_09',
        name: 'Сад Дзен',
        requiredDiplomacy: 453,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 170,
        allowedGoods: ['soy', 'paintings', 'armor', 'musical_instruments']
      },
      {
        id: 'adv_10',
        name: 'Дозьє',
        requiredDiplomacy: 530,
        goodsCostPolicy: 'flex_mix_same_total',
        totalGoodsCost: 190,
        allowedGoods: ['soy', 'paintings', 'armor', 'musical_instruments']
      }
    ]
  }
};

const ensureTechTree = (pack) => {
  if (pack?.techTree?.advancementsCatalog?.length) {
    return pack;
  }

  return {
    ...pack,
    techTree: piratesRulePack.techTree,
  };
};

export const RULE_PACKS = {
  pirates: ensureTechTree(piratesRulePack),
  vikings: ensureTechTree(vikingsRulePack),
  aztecs: ensureTechTree(aztecsRulePack),
  egyptians: ensureTechTree(egyptiansRulePack),
  mughals: ensureTechTree(mughalsRulePack),
  polynesia: ensureTechTree(polynesiaRulePack),
  japanese: ensureTechTree(japaneseRulePack)
};

export default RULE_PACKS;