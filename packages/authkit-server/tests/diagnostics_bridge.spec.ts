import { test } from "@japa/runner";
import { composeAuditSink } from "../src/events/dispatcher.js";
import { emitDiagnostic } from "../src/observability/diagnostics_bridge.js";
import type { AuditEvent } from "../src/audit/audit_sink.js";

const EMIT_SLOT = Symbol.for("@agora/diagnostics:emit");

/** Instala um emit fake no slot global e devolve um restaurador + as chamadas. */
function installFakeEmit() {
  const calls: { lib: string; event: string; payload: unknown }[] = [];
  const prev = (globalThis as Record<symbol, unknown>)[EMIT_SLOT];
  (globalThis as Record<symbol, unknown>)[EMIT_SLOT] = (
    lib: string,
    event: string,
    payload: unknown,
  ) => {
    calls.push({ lib, event, payload });
  };
  const restore = () => {
    (globalThis as Record<symbol, unknown>)[EMIT_SLOT] = prev;
  };
  return { calls, restore };
}

function clearSlot() {
  const prev = (globalThis as Record<symbol, unknown>)[EMIT_SLOT];
  delete (globalThis as Record<symbol, unknown>)[EMIT_SLOT];
  return () => {
    (globalThis as Record<symbol, unknown>)[EMIT_SLOT] = prev;
  };
}

test.group("observability/diagnostics_bridge", () => {
  test("emitDiagnostic chama o slot com (authkit, event, payload)", ({
    assert,
  }) => {
    const { calls, restore } = installFakeEmit();
    try {
      emitDiagnostic("login.success", {
        type: "login.success",
        accountId: "acc-1",
      });
    } finally {
      restore();
    }
    assert.lengthOf(calls, 1);
    assert.equal(calls[0].lib, "authkit");
    assert.equal(calls[0].event, "login.success");
    assert.deepEqual(calls[0].payload, {
      type: "login.success",
      accountId: "acc-1",
    });
  });

  test("emitDiagnostic é no-op (não lança) quando o slot está ausente", ({
    assert,
  }) => {
    const restore = clearSlot();
    try {
      assert.doesNotThrow(() =>
        emitDiagnostic("mfa.enabled", { type: "mfa.enabled" }),
      );
    } finally {
      restore();
    }
  });

  test("emitDiagnostic não propaga erro do slot (best-effort)", ({
    assert,
  }) => {
    const prev = (globalThis as Record<symbol, unknown>)[EMIT_SLOT];
    (globalThis as Record<symbol, unknown>)[EMIT_SLOT] = () => {
      throw new Error("boom no diagnostics");
    };
    try {
      assert.doesNotThrow(() => emitDiagnostic("account.locked", {}));
    } finally {
      (globalThis as Record<symbol, unknown>)[EMIT_SLOT] = prev;
    }
  });
});

test.group(
  "observability/diagnostics_bridge — fan-out do composeAuditSink",
  () => {
    test("cada record emite agora:authkit:<type> com o evento completo", async ({
      assert,
    }) => {
      const { calls, restore } = installFakeEmit();
      try {
        const sink = composeAuditSink(undefined);
        await sink.record({
          type: "login.success",
          accountId: "acc-1",
          email: "a@b.c",
        });
        await sink.record({ type: "mfa.enabled", accountId: "acc-2" });
      } finally {
        restore();
      }
      assert.lengthOf(calls, 2);
      assert.equal(calls[0].lib, "authkit");
      assert.equal(calls[0].event, "login.success");
      assert.equal((calls[0].payload as AuditEvent).accountId, "acc-1");
      assert.equal(calls[1].event, "mfa.enabled");
    });

    test("emite diagnostics em paralelo a onEvent (sem se atrapalharem)", async ({
      assert,
    }) => {
      const { calls, restore } = installFakeEmit();
      const observed: AuditEvent[] = [];
      try {
        const sink = composeAuditSink(undefined, {
          onEvent: (e) => void observed.push(e),
        });
        await sink.record({ type: "signup", email: "new@user.com" });
      } finally {
        restore();
      }
      assert.lengthOf(observed, 1);
      assert.lengthOf(calls, 1);
      assert.equal(calls[0].event, "signup");
    });

    test("record não lança quando o slot de diagnostics está ausente", async ({
      assert,
    }) => {
      const restore = clearSlot();
      try {
        const sink = composeAuditSink(undefined);
        await assert.doesNotReject(() =>
          sink.record({ type: "login.success", email: "a@b.c" }),
        );
      } finally {
        restore();
      }
    });
  },
);
