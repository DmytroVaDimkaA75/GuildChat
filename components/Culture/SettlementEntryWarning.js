// components/Culture/SettlementEntryWarning.js
//
// Попередження перед автоматичним входом у культурне поселення.
//
// Чому воно взагалі потрібне: єдиний спосіб потрапити в поселення — тап по
// кораблику в місті. Автомат наводиться розрахунком, але камера гри не завжди
// зупиняється точно там, де очікується. Якщо тап промахнеться, він упаде на
// якусь споруду міста — а тап по готовій споруді гра зараховує як ЗБІР, одразу
// й без підтвердження. Тобто виробництво, яке людина тримала навмисно (під
// квест, подію, бонус), може зникнути.
//
// Тому рішення лишається за людиною, а не за програмою.

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { COLORS } from './SettlementProductions';

export default function SettlementEntryWarning({ visible, onCancel, onContinue }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessible={false}>
        <Pressable style={styles.card} onPress={() => {}} accessible={false} accessibilityViewIsModal>
          <Text style={styles.body}>
            В процесі відкриття мапи поселення можливий неконтрольований збір з
            деяких будівель у вашому місті.
          </Text>

          <TouchableOpacity style={styles.primary} onPress={onContinue} activeOpacity={0.8}>
            <Text style={styles.primaryText}>Продовжити</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onCancel} activeOpacity={0.8}>
            <Text style={styles.secondaryText}>Скасувати</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 18,
  },
  body: {
    color: COLORS.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  primary: {
    marginTop: 6,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },
  primaryText: { color: '#0f1115', fontSize: 14, fontWeight: '700' },
  secondary: {
    marginTop: 10,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryText: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },
});
