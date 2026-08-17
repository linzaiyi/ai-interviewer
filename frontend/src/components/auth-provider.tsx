"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { API_BASE } from "@/lib/utils";
import { toast } from "sonner";

interface AuthContextType {
  user: { user_id: number; email?: string } | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  openLoginModal: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  isLoading: true,
  openLoginModal: () => {},
});

/** 校验邮箱格式：必须有 @ 且 @ 前后都有内容，域名部分必须包含 . */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 解码 JWT token 的 payload 部分（base64url → JSON） */
function decodeJwtPayload(token: string): { sub?: string; email?: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url → base64
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ user_id: number; email?: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // 登录弹窗状态
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const passwordTimerRef = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem("auth_token");
    if (saved) {
      const payload = decodeJwtPayload(saved);
      const userId = payload?.sub ? parseInt(payload.sub, 10) : 0;
      setToken(saved);
      setUser({ user_id: userId, email: payload?.email });
    }
    setIsLoading(false);
  }, []);

  // ESC 关闭登录弹窗
  useEffect(() => {
    if (!showLoginModal) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeLoginModal();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [showLoginModal]);

  const applyToken = (accessToken: string) => {
    const payload = decodeJwtPayload(accessToken);
    const userId = payload?.sub ? parseInt(payload.sub, 10) : 0;
    setToken(accessToken);
    setUser({ user_id: userId, email: payload?.email });
    localStorage.setItem("auth_token", accessToken);
  };

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "登录失败");
    }
    const data = await res.json();
    applyToken(data.access_token);
  };

  const register = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "注册失败");
    }
    const data = await res.json();
    applyToken(data.access_token);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("auth_token");
  };

  const openLoginModal = useCallback(() => {
    setLoginEmail("");
    setLoginPassword("");
    setConfirmPassword("");
    setIsRegister(false);
    setEmailError("");
    setPasswordError("");
    setShowLoginModal(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    setShowLoginModal(false);
    setEmailError("");
    setPasswordError("");
  }, []);

  const handleAuth = async () => {
    if (!loginEmail) {
      toast.warning("请填写邮箱地址");
      return;
    }
    if (!isValidEmail(loginEmail)) {
      toast.warning("请输入有效的邮箱地址");
      return;
    }
    if (!loginPassword) {
      toast.warning("请填写密码");
      return;
    }
    if (loginPassword.length < 6) {
      toast.warning("密码至少需要6位");
      return;
    }
    if (isRegister && loginPassword.length !== 6) {
      toast.warning("密码要求填的是6位");
      return;
    }
    if (passwordError) {
      toast.warning(passwordError);
      return;
    }
    if (isRegister && !confirmPassword) {
      toast.warning("请再次输入确认密码");
      return;
    }
    if (isRegister && loginPassword !== confirmPassword) {
      toast.warning("两次密码输入不一致");
      return;
    }
    setAuthLoading(true);
    try {
      if (isRegister) {
        await register(loginEmail, loginPassword);
      } else {
        await login(loginEmail, loginPassword);
      }
      setShowLoginModal(false);
    } catch (e: any) {
      const msg = e.message || "操作失败";
      if (msg.includes("邮箱或密码错误") || msg.includes("Unauthorized")) {
        toast.error("邮箱或密码错误。如未注册，请点击下方「去注册」先创建账号");
      } else {
        toast.error(msg);
      }
    }
    setAuthLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading, openLoginModal }}>
      {children}
      {/* 全局登录弹窗 */}
      {showLoginModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && closeLoginModal()}
        >
          <div
            className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl"
            tabIndex={0}
          >
            <h2 className="text-xl font-bold mb-6">{isRegister ? "注册" : "登录"}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">邮箱</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLoginEmail(val);
                    if (val && !isValidEmail(val)) {
                      setEmailError("请输入有效的邮箱地址");
                    } else {
                      setEmailError("");
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                    emailError ? "border-red-500 focus:ring-red-200" : "focus:ring-primary/20"
                  }`}
                  placeholder="your@email.com"
                />
                {emailError && (
                  <p className="text-red-500 text-xs mt-1">{emailError}</p>
                )}
              </div>
              {!emailError && loginEmail && (
                <div>
                  <label className="block text-sm font-medium mb-1">密码</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setPasswordError("");
                      if (passwordTimerRef.current) clearTimeout(passwordTimerRef.current);
                      const val = e.target.value;
                      if (!val) return;
                      passwordTimerRef.current = setTimeout(() => {
                        if (val.length < 6) {
                          setPasswordError("密码至少需要6位");
                        } else if (val.length > 6) {
                          setPasswordError("密码要求填的是6位");
                        } else {
                          setPasswordError("");
                        }
                      }, 800);
                    }}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                      passwordError ? "border-red-500 focus:ring-red-200" : "focus:ring-primary/20"
                    }`}
                    placeholder="至少6位"
                  />
                  {passwordError && (
                    <p className="text-red-500 text-xs mt-1">{passwordError}</p>
                  )}
                </div>
              )}
              {isRegister && (
                <div>
                  <label className="block text-sm font-medium mb-1">确认密码</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="再次输入密码"
                  />
                </div>
              )}
              <button
                onClick={handleAuth}
                disabled={authLoading}
                className="w-full py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {authLoading ? "处理中..." : isRegister ? "注册" : "登录"}
              </button>
              <p className="text-center text-sm text-muted-foreground">
                {isRegister ? "已有账号？" : "没有账号？"}
                <button
                  onClick={() => setIsRegister(!isRegister)}
                  className="text-primary ml-1 hover:underline"
                >
                  {isRegister ? "去登录" : "去注册"}
                </button>
              </p>
            </div>
            <button
              onClick={closeLoginModal}
              className="mt-4 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);