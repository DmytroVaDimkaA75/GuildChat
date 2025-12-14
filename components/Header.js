import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";

const Header = ({ title, toggleMenu }) => {
  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <TouchableOpacity style={styles.menuButton} onPress={toggleMenu}>
          <Image
            source={require("./assets/menu-icon.png")} // Замените на путь к вашему значку меню
            style={styles.menuIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 100,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: "#517da2",
    paddingHorizontal: 16,
    position: "absolute",
    paddingTop: 40,
    left: 0,
    top: 0,
    zIndex: 20, 
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Arial Black", // Замените на доступный шрифт
    color: "white",
    marginLeft: 16,
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 16,
    paddingTop: 8,
  },
  menuIcon: {
    width: 24,
    height: 24,
  },
});

export default Header;