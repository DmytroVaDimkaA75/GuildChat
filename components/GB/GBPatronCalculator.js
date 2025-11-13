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
          // Додаємо саме placeCosts[k], а не Guar[k]
          sumGuarAbove += placeCosts[k] ?? 0;
        }
      }

      // 3. Визначаємо, що віднімати для поточного місця
      let currentValue;
      if (!patronIds[idx]) {
        // Місце не зайняте — віднімаємо подвійну вартість місця
        currentValue = 2 * (placeCosts[idx] ?? 0);
      } else {
        // Місце зайняте — віднімаємо вклад
        currentValue = invests[idx] ?? 0;
      }

      // 4. Розрахунок гаранту
      let guar = levelValue
        - ownerDeposit
        - totalDeposits
        - sumGuarAbove
        - currentValue;

      // 5. Додаємо вклад чужинця нижче для будь-якого місця, якщо він є
      if (strangerBelowIdx !== null) {
        guar += invests[strangerBelowIdx] ?? 0;
      }

      Guar.push(guar);
      // ...логування залишаємо за бажанням...
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