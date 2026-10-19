import { useState } from "react";
import { useRouter } from "next/router";
import { Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Toaster } from "../components/ui/sonner";
import {
  loginDashboard,
  requestPasswordReset,
  verifyResetOtp,
  resetDashboardPassword,
  cancelPasswordRecovery,
} from "../lib/api";
import { beginDashboardSession } from "../lib/sessionLifecycle";
import loginBgImg from "../../imports/login bg.png";
import loginElementImg from "../../imports/login element.png";
import loginMascotImg from "../../imports/login mascot.png";
import loginPawImg from "../../imports/login paw.png";

type ForgotPasswordStep = "email" | "otp" | "newPassword";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPasswordReset: () => void;
}

function ForgotPasswordModal({
  isOpen,
  onClose,
  onPasswordReset,
}: ForgotPasswordModalProps) {
  const [step, setStep] = useState<ForgotPasswordStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetModal = () => {
    setEmail("");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setStep("email");
  };

  const handleClose = () => {
    void cancelPasswordRecovery().catch(() => {});
    resetModal();
    onClose();
  };

  const handleEmailSubmit = async () => {
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }

    setIsSubmitting(true);

    try {
      await requestPasswordReset(email.trim());
      toast.success("Check your email", {
        description: "If the address is eligible, a password-reset code has been sent. Check your inbox and spam folder.",
      });
      setStep("otp");
    } catch (error) {
      toast.error("Unable to send OTP", {
        description:
          error instanceof Error
            ? error.message
            : "Please check the dashboard email and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async () => {
    if (!/^\d{6}$/.test(otp.trim())) return void toast.error("Enter the six-digit code from your email");
    setIsSubmitting(true);
    try {
      await verifyResetOtp(email.trim(), otp.trim());
      setStep("newPassword");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to verify code"); }
    finally { setIsSubmitting(false); }
  };

  const handlePasswordSubmit = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.length < 12) {
      toast.error("Password must be at least 12 characters");
      return;
    }

    setIsSubmitting(true);

    try {
      await resetDashboardPassword(newPassword);
      toast.success("Password updated. Sign in with your new password and authenticator.");
      handleClose();
      onPasswordReset();
    } catch (error) {
      toast.error("Unable to reset password", {
        description:
          error instanceof Error
            ? error.message
            : "Please request a new OTP and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="woof-forgot-modal w-full max-w-md max-h-[90vh] overflow-y-auto space-y-5 sm:space-y-6 rounded-2xl bg-white/95 backdrop-blur-md p-6 sm:p-8 shadow-2xl border border-[#FFD9EC]">
        {step === "email" && (
          <>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-[#223047]">
                Forgot Password?
              </h2>
              <p className="text-sm text-[#223047] opacity-60">
                Enter your email address and we'll send you a 6-digit OTP code.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[#223047]">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#223047] opacity-40" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="woofdash@gmail.com"
                  className="woof-forgot-input w-full rounded-xl border-2 border-[#FFD9EC] py-3 pl-11 pr-4 transition-colors focus:border-[#F53799] focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleClose}
                variant="outline"
                className="woof-forgot-cancel flex-1 rounded-xl border-[#FFD9EC]"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleEmailSubmit}
                className="flex-1 rounded-xl bg-[#F53799] text-white hover:bg-[#D42A7D]"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sending..." : "Send OTP"}
              </Button>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-[#223047]">Enter OTP</h2>
              <p className="text-sm text-[#223047] opacity-60">
                If your address is eligible, a 6-digit code was sent to {email}. Check your inbox and spam folder.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[#223047]">
                6-Digit OTP
              </label>
              <input
                type="text"
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="woof-forgot-input w-full rounded-xl border-2 border-[#FFD9EC] px-4 py-3 text-center text-2xl font-bold tracking-widest transition-colors focus:border-[#F53799] focus:outline-none"
                disabled={isSubmitting}
                inputMode="numeric"
                maxLength={6}
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleClose}
                variant="outline"
                className="woof-forgot-cancel flex-1 rounded-xl border-[#FFD9EC]"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleOtpSubmit}
                className="flex-1 rounded-xl bg-[#F53799] text-white hover:bg-[#D42A7D]"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Verifying..." : "Verify OTP"}
              </Button>
            </div>
          </>
        )}

        {step === "newPassword" && (
          <>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-[#223047]">
                Create New Password
              </h2>
              <p className="text-sm text-[#223047] opacity-60">
                Enter your new password below
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#223047]">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#223047] opacity-40" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Enter new password"
                    className="woof-forgot-input woof-password-field w-full rounded-xl border-2 border-[#FFD9EC] py-3 pl-11 pr-12 transition-colors focus:border-[#F53799] focus:outline-none"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((value) => !value)}
                    className="woof-forgot-eye absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#223047] opacity-50 transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#F53799]/30"
                    disabled={isSubmitting}
                    aria-label={
                      showNewPassword ? "Hide new password" : "Show new password"
                    }
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[#223047]">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#223047] opacity-40" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    placeholder="Confirm new password"
                    className="woof-forgot-input woof-password-field w-full rounded-xl border-2 border-[#FFD9EC] py-3 pl-11 pr-12 transition-colors focus:border-[#F53799] focus:outline-none"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="woof-forgot-eye absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#223047] opacity-50 transition hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#F53799]/30"
                    disabled={isSubmitting}
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirmation password"
                        : "Show confirmation password"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleClose}
                variant="outline"
                className="woof-forgot-cancel flex-1 rounded-xl border-[#FFD9EC]"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handlePasswordSubmit}
                className="flex-1 rounded-xl bg-[#F53799] text-white hover:bg-[#D42A7D]"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    if (requiresTwoFactor && twoFactorCode.length !== 6) {
      toast.error("Please enter your 6-digit authenticator code");
      return;
    }

    setIsLoggingIn(true);

    try {
      const session = await loginDashboard(
        email.trim(),
        password,
        requiresTwoFactor ? twoFactorCode : undefined,
      );

      if ("requiresTwoFactor" in session && session.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        toast.info("Enter your authenticator code to continue");
        setIsLoggingIn(false);
        return;
      }

      beginDashboardSession();
      sessionStorage.setItem("woofSessionActive", "true");
      sessionStorage.setItem("woofUserEmail", session.email);

      // A password-only session is AAL1. Do not render or prefetch dashboard
      // routes before the user completes first-factor enrollment.
      if (session.mfaRequired) {
        router.replace("/mfa-enroll");
        return;
      }

      toast.success("Welcome back!", {
        description: "Signed in to WOOF.",
      });

      // Silently prefetch all sector routes in the background so they are
      // pre-compiled by the time the user clicks a tab (eliminates 5-7s delay).
      const routesToPrefetch = [
        "/",
        "/cafe",
        "/services",
        "/retail",
        "/ai-simulation",
        "/smart-reports",
        "/feedback",
        "/settings",
      ];
      routesToPrefetch.forEach((route, i) => {
        setTimeout(() => {
          router.prefetch(route);
          // Also do a real fetch to force server-side compilation in dev mode
          fetch(route, { priority: "low" as RequestPriority }).catch(() => {});
        }, i * 200);
      });

      router.push("/");
    } catch (error) {
      toast.error("Unable to sign in", {
        description:
          error instanceof Error
            ? error.message
            : "Please check your dashboard credentials and try again.",
      });
      setTwoFactorCode("");
      setRequiresTwoFactor(false);
      setIsLoggingIn(false);
    }
  };

  const handlePasswordReset = () => {
    setEmail("");
    setPassword("");
    setTwoFactorCode("");
    setRequiresTwoFactor(false);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_70%_55%,rgba(245,55,153,.06),transparent_35%),#fff8fc] text-[#10162f]">
      <div
        className="woof-login-composition relative mx-auto min-h-screen w-full max-w-[1920px] overflow-hidden"
        style={{ "--woof-login-storefront": `url("${loginBgImg.src}")` } as React.CSSProperties}
      >
      {/* Desktop foreground backdrop wave */}
      <img
        src={loginElementImg.src}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-2vh] left-1/2 z-[2] hidden w-[max(100vw,1440px)] max-w-none -translate-x-1/2 select-none xl:block"
      />
      <img src={loginPawImg.src} alt="" aria-hidden="true" className="pointer-events-none absolute right-[5%] top-[2%] z-[4] hidden w-14 rotate-[-18deg] select-none opacity-[0.13] xl:block" />
      <img src={loginPawImg.src} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-[10%] left-[7%] z-[4] hidden w-12 rotate-[18deg] select-none opacity-[0.14] xl:block" />
      <img src={loginPawImg.src} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-[21%] left-[55%] z-[4] hidden w-10 rotate-[-14deg] select-none opacity-[0.12] xl:block" />

      {/* Mobile ambient background: rich blurred storefront with gentle ambient dimming */}
      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden xl:hidden" aria-hidden="true">
        <img
          src={loginBgImg.src}
          alt=""
          className="h-full w-full object-cover object-center opacity-65 blur-md scale-110"
        />
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      </div>

      <main className="relative flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 xl:block xl:p-0" aria-label="WOOF sign in">
        <img src={loginMascotImg.src} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-[clamp(100px,13vh,150px)] right-[30.5vw] z-[6] hidden w-[clamp(300px,22vw,400px)] select-none xl:block" />

        <section className="relative z-[5] w-full max-w-[420px] sm:max-w-[460px] xl:absolute xl:right-[clamp(45px,5vw,95px)] xl:top-1/2 xl:block xl:w-[clamp(420px,28vw,500px)] xl:-translate-y-1/2">
          <div className="w-full rounded-[24px] sm:rounded-[28px] border border-[#f53799]/15 bg-white/92 p-5 sm:p-8 shadow-[0_20px_60px_rgba(98,40,75,.12),0_6px_25px_rgba(245,55,153,.08)] backdrop-blur-md xl:rounded-[32px] xl:bg-white/[.96] xl:px-[clamp(2.75rem,3vw,3.25rem)] xl:py-[clamp(2.5rem,4vh,3.1rem)]">
            <header className="mb-5 sm:mb-6 text-center xl:mb-7">
              {/* Mobile mascot avatar badge */}
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#FFF2FA] to-[#FFE3F1] p-1.5 shadow-xs border border-[#FFD9EC] xl:hidden">
                <img
                  src={loginMascotImg.src}
                  alt="Happy Tails mascot"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="text-3xl sm:text-[clamp(2.35rem,4vw,3.6rem)] font-extrabold leading-none tracking-[-.07em] text-[#F53799]">WOOF</div>
              <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm font-semibold tracking-[.01em] text-[#10162f]">Cross-Intelligence Platform</p>
              <h1 className="mt-4 sm:mt-6 text-xl sm:text-2xl font-extrabold tracking-[-.03em] text-[#F53799] xl:text-[clamp(1.85rem,2.15vw,2.35rem)]">Welcome Back!</h1>
            </header>

            <form onSubmit={handleLogin} className="space-y-3.5 sm:space-y-4" aria-label="Sign in form">
              <div>
                <label htmlFor="login-email" className="mb-1.5 sm:mb-2 block text-xs sm:text-sm font-semibold text-[#223047]">Email address</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7181a1]" aria-hidden="true" />
                  <input id="login-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setRequiresTwoFactor(false); setTwoFactorCode(""); }} placeholder="Enter your email" className="h-12 sm:h-14 w-full rounded-xl sm:rounded-2xl border border-[#d9dfe8] bg-[#fcfcfe] py-3 pl-12 pr-4 text-sm sm:text-base text-[#223047] outline-none transition placeholder:text-[#7181a1] focus:border-[#F53799] focus:bg-white focus:ring-4 focus:ring-[#F53799]/12" disabled={isLoggingIn} />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 sm:mb-2 block text-xs sm:text-sm font-semibold text-[#223047]">Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7181a1]" aria-hidden="true" />
                  <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setRequiresTwoFactor(false); setTwoFactorCode(""); }} placeholder="Enter your password" className="woof-password-field h-12 sm:h-14 w-full rounded-xl sm:rounded-2xl border border-[#d9dfe8] bg-[#fcfcfe] py-3 pl-12 pr-12 text-sm sm:text-base text-[#223047] outline-none transition placeholder:text-[#7181a1] focus:border-[#F53799] focus:bg-white focus:ring-4 focus:ring-[#F53799]/12" disabled={isLoggingIn} />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-[#7181a1] transition hover:bg-[#fff0f7] hover:text-[#F53799] focus:outline-none focus:ring-2 focus:ring-[#F53799]/35" disabled={isLoggingIn} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {requiresTwoFactor && (
                <div>
                  <label htmlFor="login-two-factor" className="mb-1.5 sm:mb-2 block text-xs sm:text-sm font-semibold text-[#223047]">Authenticator code</label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7181a1]" aria-hidden="true" />
                    <input id="login-two-factor" name="twoFactorCode" type="text" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" className="h-12 sm:h-14 w-full rounded-xl sm:rounded-2xl border border-[#d9dfe8] bg-[#fcfcfe] py-3 pl-12 pr-4 text-center font-bold tracking-[0.2em] text-[#223047] outline-none transition placeholder:font-normal placeholder:tracking-normal focus:border-[#F53799] focus:bg-white focus:ring-4 focus:ring-[#F53799]/12" disabled={isLoggingIn} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-0.5">
                <button type="button" onClick={() => setShowForgotPassword(true)} className="min-h-10 sm:min-h-11 rounded-lg px-1 text-xs sm:text-sm font-bold text-[#0c9bbc] transition hover:text-[#087b96] hover:underline focus:outline-none focus:ring-2 focus:ring-[#0c9bbc]/35" disabled={isLoggingIn}>Forgot password?</button>
              </div>
              <Button type="submit" className="h-12 sm:h-14 w-full rounded-xl sm:rounded-2xl bg-[#F53799] text-sm sm:text-base font-bold text-white shadow-[0_10px_20px_rgba(245,55,153,.24)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#df217f] hover:shadow-[0_16px_28px_rgba(245,55,153,.34)] active:translate-y-0 active:scale-[.99] focus-visible:ring-4 focus-visible:ring-[#F53799]/35" disabled={isLoggingIn}>
                {isLoggingIn ? "Signing In..." : "Sign In"}
              </Button>
            </form>
          </div>
        </section>
      </main>

      <ForgotPasswordModal
        isOpen={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        onPasswordReset={handlePasswordReset}
      />
      <Toaster />
    </div>
    </div>
  );
}
