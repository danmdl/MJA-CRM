"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CountryCode = "AR" | "OTHER";

interface CountryPhoneInputProps {
  label?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  defaultCountry?: CountryCode;
  hintExample?: string;
  disabled?: boolean;
  hideExample?: boolean;
}

const CountryPhoneInput: React.FC<CountryPhoneInputProps> = ({ 
  label = "Teléfono", 
  value, 
  onChange, 
  defaultCountry = "AR", 
  hintExample = "Ej: 5491122334455",
  disabled = false,
  hideExample = false
}) => {
  const [country, setCountry] = useState<CountryCode>(defaultCountry);
  const [phone, setPhone] = useState<string>(value || "");

  useEffect(() => {
    setPhone(value || "");
  }, [value]);

  const handleBlur = () => {
    if (country === "AR") {
      const digits = phone.replace(/[^\d]/g, "");
      if (!digits.startsWith("549")) {
        onChange("549" + digits);
        return;
      }
    }
    onChange(phone || null);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        <Select 
          value={country} 
          onValueChange={(v: CountryCode) => setCountry(v)}
          disabled={disabled} // Pass disabled prop
        >
          <SelectTrigger className="col-span-1">
            <SelectValue placeholder="País" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AR">Argentina (+54)</SelectItem>
            <SelectItem value="OTHER">Otro</SelectItem>
          </SelectContent>
        </Select>
        <Input 
          className="col-span-2" 
          value={phone} 
          onChange={(e) => setPhone(e.target.value)} 
          onBlur={handleBlur} 
          placeholder="Ej: 1165129359"
          inputMode="tel"
          disabled={disabled}
        />
      </div>
      {!hideExample && <div className="text-xs text-muted-foreground">Ejemplo: 1165129359</div>}
    </div>
  );
};

export default CountryPhoneInput;