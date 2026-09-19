import { RouterProvider } from "react-router-dom";
import { Providers } from "@/app/providers";
import { AuthGate } from "@/app/auth-gate";
import { router } from "@/app/router";
import { Toaster } from "@/components/ui/toaster";

function App() {
  return (
    <Providers>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
      <Toaster />
    </Providers>
  );
}

export default App;
