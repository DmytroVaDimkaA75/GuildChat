import React, { useEffect } from 'react';

const GBPatronCalculator = ({
  placeCosts,
  totalFP,
  ownerContribution,
  distribution,
  onCalculationComplete
}) => {
  useEffect(() => {
    // Масиви з порожніми значеннями (null) для відповідності індексів
    const patronIds = Array.isArray(distribution)
      ? distribution.map(d => d ? d.patronId : null)
      : [];
    const invests = Array.isArray(distribution)
      ? distribution.map(d => d ? d.invest : null)
      : [];

    // Масив для зберігання значень Guar
    const Guar = [];

    // Розрахунок гаранту для кожного місця згідно з правилами
    const totalDeposits = invests.reduce((acc, val) => acc + (val ?? 0), 0);
    const ownerDeposit = ownerContribution ?? 0;
    const levelValue = totalFP ?? 0;
    // Визначаємо кількість місць як максимум з placeCosts і distribution
    const numPlaces = Math.max(
      Array.isArray(placeCosts) ? placeCosts.length : 0,
      Array.isArray(distribution) ? distribution.length : 0
    );

    for (let idx = 0; idx < numPlaces; idx++) {
      // Шукаємо чужинця нижче для будь-якого місця
      let strangerBelowIdx = null;
      for (let j = idx + 1; j < numPlaces; j++) {
        if (patronIds[j] === "stranger") {
          strangerBelowIdx = j;
          break;
        }
      }

      // 2. Сума гарантій на не зайнятих місцях вище поточного
      let sumGuarAbove = 0;
      for (let k = 0; k < idx; k++) {
        if (!patronIds[k]) {
          sumGuarAbove += Guar[k] ?? 0;
        }
      }

      // 3. Визначаємо вклад/номінал для поточного місця
      let currentValue = patronIds[idx] ? (invests[idx] ?? 0) : (placeCosts[idx] ?? 0);

      // Додатковий лог для третього місця (індекс 2)
      if (idx === 2) {
        console.log('[DEBUG] idx=2 (чужинець): levelValue=', levelValue, 'ownerDeposit=', ownerDeposit, 'totalDeposits=', totalDeposits, 'sumGuarAbove=', sumGuarAbove, 'currentValue=', currentValue);
      }

      // 4. Розрахунок гаранту
      let guar = levelValue
        - ownerDeposit
        - totalDeposits
        - sumGuarAbove
        - currentValue;

      // 5. Додаємо вклад чужинця нижче для будь-якого місця, якщо він є
      let strangerInvestAdded = false;
      if (strangerBelowIdx !== null) {
        guar += invests[strangerBelowIdx] ?? 0;
        strangerInvestAdded = true;
      }

      Guar.push(guar);
      console.log(`місце ${idx + 1}: ${patronIds[idx] || '—'}, Guar = ${guar}`);
      console.log(`idx=${idx}, patronId=${patronIds[idx]}, isStranger=${patronIds[idx]==='stranger'}, strangerBelowIdx=${strangerBelowIdx}, strangerInvest=${strangerBelowIdx!==null ? invests[strangerBelowIdx] : '—'}, strangerInvestAdded=${strangerInvestAdded}`);
    }

    // Вивід масиву Guar після циклу
    console.log('Guar:', Guar);

    console.log('placeCosts:', placeCosts);
    console.log('distribution.invest:', distribution.map(d => d?.invest));
    console.log('distribution.patronId:', distribution.map(d => d?.patronId));
    console.log('ownerContribution:', ownerContribution);
    console.log('totalFP:', totalFP);

    onCalculationComplete?.({
      placeCosts,
      totalFP,
      ownerContribution,
      distribution,
      Guar
    });
  }, [placeCosts, totalFP, ownerContribution, distribution, onCalculationComplete]);

  return null;
};

export default GBPatronCalculator;