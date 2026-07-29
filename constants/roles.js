export const USER_ROLES = Object.freeze({
  GUILD_LEADER: "guildLeader",
  TESTER: "tester",
  DEVELOPER: "developer",
  MEMBER: "member",
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
    default:
      return role;
  }
};
