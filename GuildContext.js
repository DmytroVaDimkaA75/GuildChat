import React, { createContext, useCallback, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";

export const GuildContext = createContext();

export const GuildProvider = ({ children }) => {
  const [guildId, setGuildId] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false); // додатковий стан для відстеження, чи завантажено значення

  const switchGuild = useCallback(async (nextGuildId) => {
    const normalizedGuildId = nextGuildId ? String(nextGuildId) : "";
    if (!normalizedGuildId) return false;
    await AsyncStorage.setItem("guildId", normalizedGuildId);
    setGuildId(normalizedGuildId);
    return true;
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("guildId")
      .then((value) => {
        if (value) {
          setGuildId(value);
        }
      })
      .catch((error) => {
        console.error("Помилка при зчитуванні guildId:", error);
      })
      .finally(() => {
        setIsLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!guildId) return;
    const bridge = NativeModules?.GbgWidgetBridge;
    if (bridge && typeof bridge.setGuildId === "function") {
      bridge.setGuildId(String(guildId));
    }
  }, [guildId]);

  if (!isLoaded) {
    // Можна повернути спіннер або просто null, щоб не рендерити дітей
    return null;
  }

  return (
    <GuildContext.Provider value={{ guildId, setGuildId, switchGuild }}>
      {children}
    </GuildContext.Provider>
  );
};
