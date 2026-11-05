import { useState } from "react";
import { LogIn, LogOut, User, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "../ui/drawer";
import { SettingItem } from "./SettingItem";
import { useAccountStore } from "@/store/account-store";
import {
  accountRegister,
  accountLogin,
  accountLogout,
} from "@/lib/api/account";
import { toastUtils } from "@/lib/utils/toast";

type Mode = "login" | "register";

/** 后端 fail() 返回 ApiResponse JSON；ApiError.message 是原始响应文本，尽量提取人话 */
function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    try {
      const parsed = JSON.parse(e.message);
      if (typeof parsed?.message === "string") return parsed.message;
    } catch {
      // not JSON
    }
    return e.message || "操作失败";
  }
  return "操作失败，请重试";
}

export function AccountConfig() {
  const { email, token, setAccount, clearAccount } = useAccountStore();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setEmailInput("");
    setPassword("");
    setMode("login");
  };

  const handleSubmit = async () => {
    if (!emailInput.trim() || !password) return;
    setLoading(true);
    try {
      const result =
        mode === "register"
          ? await accountRegister(emailInput.trim(), password)
          : await accountLogin(emailInput.trim(), password);
      setAccount(result.email, result.token);
      // syncKey 由账号绑定，写回 sync-store 后 App 的同步 effect 自动触发
      const { useSyncStore } = await import("@/store/sync-store");
      if (result.syncKey) useSyncStore.getState().setSyncKey(result.syncKey);
      toastUtils.success(mode === "register" ? "注册成功" : "登录成功");
      setOpen(false);
      resetForm();
    } catch (e) {
      toastUtils.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm("确定退出登录吗？本地数据保留，同步暂停。")) return;
    if (token) await accountLogout(token);
    clearAccount();
    toastUtils.success("已退出登录");
  };

  return (
    <>
      <SettingItem
        icon={User}
        title="One Music 账号"
        subtitle={email ? `已登录: ${email}` : "邮箱登录后收藏与歌单自动云同步"}
        action={
          email ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleLogout();
              }}
              className="text-muted-foreground hover:text-foreground p-2"
              aria-label="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
            >
              登录
            </Button>
          )
        }
        onClick={email ? undefined : () => setOpen(true)}
      />

      <Drawer
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetForm();
        }}
      >
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>
              {mode === "login" ? "登录" : "注册新账号"}
            </DrawerTitle>
            <DrawerDescription>
              {mode === "login"
                ? "登录后可在「我的」页注册新账号"
                : "仅支持主流邮箱域（gmail/qq/163/icloud 等）"}
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 px-4 pb-4">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="邮箱"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
            <Input
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
          <DrawerFooter className="gap-2 pt-0">
            <Button
              variant="ghost"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !emailInput.trim() || password.length < 6}
              className="h-11"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <LogIn className="mr-2 h-4 w-4" />
              {mode === "login" ? "登录" : "注册并登录"}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
