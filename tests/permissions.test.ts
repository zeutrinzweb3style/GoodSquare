import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_RANK,
  hasAtLeastRole,
  roleHasPermission,
} from "../src/lib/permissions.ts";

test("owner holds every permission", () => {
  assert.equal(roleHasPermission("owner", "community:delete"), true);
  assert.equal(roleHasPermission("owner", "treasury:manage"), true);
  assert.equal(roleHasPermission("owner", "vote:cast"), true);
});

test("moderators can moderate quests but not manage members", () => {
  assert.equal(roleHasPermission("moderator", "quest:moderate"), true);
  assert.equal(roleHasPermission("moderator", "member:manage"), false);
  assert.equal(roleHasPermission("moderator", "community:delete"), false);
});

test("visitors and missing roles have no permissions", () => {
  assert.equal(roleHasPermission("visitor", "vote:cast"), false);
  assert.equal(roleHasPermission(null, "vote:cast"), false);
  assert.equal(roleHasPermission(undefined, "vote:cast"), false);
});

test("role ranking is ordered from owner down to visitor", () => {
  assert.ok(ROLE_RANK.owner > ROLE_RANK.admin);
  assert.ok(ROLE_RANK.admin > ROLE_RANK.moderator);
  assert.ok(ROLE_RANK.moderator > ROLE_RANK.contributor);
  assert.ok(ROLE_RANK.contributor > ROLE_RANK.member);
  assert.ok(ROLE_RANK.member > ROLE_RANK.visitor);
});

test("hasAtLeastRole compares by rank", () => {
  assert.equal(hasAtLeastRole("admin", "moderator"), true);
  assert.equal(hasAtLeastRole("member", "moderator"), false);
  assert.equal(hasAtLeastRole("moderator", "moderator"), true);
  assert.equal(hasAtLeastRole(null, "visitor"), false);
});
