import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppContext } from "../components/app-context";
import { GlassSidebar } from "../components/edupilot-app";
import { ToolPage } from "../components/workspace/materials";

function render(role: string, child: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(AppContext.Provider, { value: {
    user: { firstName: "Тест", lastName: "Аккаунт", role, settings: { preferences: { viewMode: role === "teacher" ? "student" : "teacher" } } },
    ai: { mode: "mock", configured: false, capabilities: {} },
    refresh: async () => {}, navigate: () => {},
  } }, child));
}

describe("Доступные действия кабинета", () => {
  it.each(["teacher", "student"])("показывает меню настоящей роли %s без переключателя и создания медиа", (role) => {
    const html = render(role, createElement(GlassSidebar, { path: "/workspace", view: role === "teacher" ? "student" : "teacher" }));
    const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]*>/g, ""));
    expect(buttons).not.toContain("Учитель");
    expect(buttons).not.toContain("Ученик");
    expect(html).not.toContain("Создать презентацию");
    expect(html).not.toContain("Создать видеоурок");
    if (role === "teacher") expect(html).toContain("Создать план урока");
    else {
      expect(html).toContain("Создать конспект");
      expect(html).not.toContain("Создать план урока");
    }
  });
  it.each(["presentation", "video"] as const)("не показывает форму создания по прямой ссылке %s", (type) => {
    const html = render("teacher", createElement(ToolPage, { type }));
    expect(html).toContain("Создание отключено");
    expect(html).not.toContain("<form");
  });
});
