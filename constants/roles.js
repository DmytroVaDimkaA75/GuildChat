export const USER_ROLES = Object.freeze({
  GUILD_LEADER: "guildLeader",
  TESTER: "tester",
  DEVELOPER: "developer",
  MEMBER: "member",
  GBG_BOT: "GBGbot",
  GB_BOT: "GBbot",
});

export const hasTesterFeatures = (role) =>
  role === USER_ROLES.TESTER || role === USER_ROLES.DEVELOPER;

export const hasLeaderFeatures = (role) =>
  role === USER_ROLES.GUILD_LEADER || hasTesterFeatures(role);

export const canAccessGuildTasks = (role) =>
  role === USER_ROLES.DEVELOPER;

export const getUkrainianRoleLabel = (role) => {
  switch (role) {
    case USER_ROLES.GUILD_LEADER:
      return "Адміністратор";
    case USER_ROLES.TESTER:
      return "Тестер";
    case USER_ROLES.DEVELOPER:
      return "Розробник";
    case USER_ROLES.MEMBER:
      return "Користувач";
    case USER_ROLES.GBG_BOT:
      return "Бот ПБГ";
    case USER_ROLES.GB_BOT:
      return "Спостерігач за ВС";
    default:
      return role;
  }
};
