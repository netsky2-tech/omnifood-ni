import { RouterProvider } from "react-router-dom";
import { Providers } from "@/app/providers";
import { AuthGate } from "@/app/auth-gate";
import { router } from "@/app/router";

function App() {
  return (
    <Providers>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
    </Providers>
  );
}

export default App;
