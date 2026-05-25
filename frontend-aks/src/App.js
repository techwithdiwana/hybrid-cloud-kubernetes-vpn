
import React, { useEffect, useState } from "react";

function App() {
  const [message, setMessage] = useState("Loading backend response...");

  useEffect(() => {
    fetch("http://BACKEND_PRIVATE_IP:30001/api")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch(() => setMessage("Backend not reachable"));
  }, []);

  return (
    <div style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>Hybrid Cloud Demo</h1>
      <h2>Frontend Running on AKS</h2>
      <p>{message}</p>
    </div>
  );
}

export default App;
