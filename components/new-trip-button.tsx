"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NewTripDialog } from "@/components/new-trip-dialog";

export function NewTripButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New trip</Button>
      {open && <NewTripDialog onClose={() => setOpen(false)} />}
    </>
  );
}
