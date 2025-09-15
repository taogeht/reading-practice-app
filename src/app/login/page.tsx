import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Reading Practice Platform
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Teachers and Administrators
          </p>
        </div>
        <LoginForm />
        <div className="text-center">
          <p className="text-sm text-gray-600">
            Students use visual login -{" "}
            <a href="/student-login" className="text-blue-600 hover:text-blue-500">
              Click here
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}