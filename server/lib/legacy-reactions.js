function migrateReactionOwners(reactions, usersByUsername, usersById = new Map()) {
  const migrated = {};
  const unresolved = [];
  const entries = reactions && typeof reactions.entries === "function"
    ? [...reactions.entries()]
    : Object.entries(reactions || {});

  for (const [emoji, values] of entries) {
    const ids = [];
    for (const value of Array.isArray(values) ? values : []) {
      const raw = String(value);
      const namedUser = usersByUsername.get(raw);
      const idUser = /^[a-f\d]{24}$/i.test(raw) ? usersById.get(raw.toLowerCase()) : null;

      if (namedUser && idUser && String(namedUser._id) !== String(idUser._id)) {
        unresolved.push({ emoji, value: raw, reason: "AMBIGUOUS_USERNAME_OR_USER_ID" });
      } else if (namedUser) {
        ids.push(String(namedUser._id));
      } else if (idUser) {
        ids.push(String(idUser._id));
      } else if (/^[a-f\d]{24}$/i.test(raw)) {
        unresolved.push({ emoji, value: raw, reason: "USER_ID_NOT_FOUND" });
      } else {
        unresolved.push({ emoji, value: raw, reason: "USER_NOT_FOUND" });
      }
    }
    migrated[emoji] = [...new Set(ids)];
  }
  return { migrated, unresolved };
}

module.exports = { migrateReactionOwners };
