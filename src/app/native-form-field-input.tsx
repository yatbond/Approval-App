"use client";

import {
  getNativeFormFieldPlaceholder,
  parseNativeFormOptions,
  toggleNativeFormCheckboxOption,
} from "@/lib/workflow-native-form-state";
import type { WorkflowField } from "@/lib/types";

export function NativeFormFieldInput({
  field,
  value,
  onChange,
  onFocus,
  idPrefix = "",
}: {
  field: WorkflowField;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  idPrefix?: string;
}) {
  const fieldId = `${idPrefix ? `${idPrefix.replace(/[^a-zA-Z0-9_-]/g, "-")}-` : ""}native-form-${field.name}`;
  const options = (field.options || [])
    .map((option) => option.trim())
    .filter(Boolean);
  const isWide =
    field.type === "long_text" ||
    field.type === "radio" ||
    field.type === "checkbox";
  const heading = (
    <span className="mb-1 flex min-w-0 flex-wrap items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-200">
      <span className="break-words">{field.label}</span>
      {field.required && (
        <span className="rounded-sm border border-[#f7941d]/35 bg-[#fff4e6] px-1.5 py-0.5 text-[10px] font-semibold text-[#713d00] dark:bg-[#f7941d]/15 dark:text-[#ffd29a]">
          Required
        </span>
      )}
      {field.inputSource === "attachment_extraction" && (
        <span className="rounded-sm border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 dark:border-violet-500/35 dark:bg-violet-500/10 dark:text-violet-200">
          AI from attachment
        </span>
      )}
    </span>
  );
  const helpText = field.instructions?.trim() ? (
    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
      {field.instructions}
    </p>
  ) : null;
  const wrapperClass = isWide ? "block md:col-span-2" : "block";
  const inputClass =
    "min-h-11 w-full rounded-md border border-[#d8d8d8] bg-white px-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#f7941d] focus:ring-2 focus:ring-[#f7941d]/15 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600";

  if (field.type === "checkbox") {
    const selectedOptions = parseNativeFormOptions(value);
    return (
      <fieldset className={wrapperClass} onFocus={onFocus}>
        <legend>{heading}</legend>
        <div className="grid gap-2 rounded-md border border-[#d8d8d8] bg-white p-3 sm:grid-cols-2 dark:border-neutral-700 dark:bg-neutral-950">
          {options.map((option, optionIndex) => (
            <label
              key={`${option}-${optionIndex}`}
              htmlFor={`${fieldId}-${optionIndex}`}
              className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200"
            >
              <input
                id={`${fieldId}-${optionIndex}`}
                type="checkbox"
                checked={selectedOptions.includes(option)}
                onChange={(event) =>
                  onChange(
                    toggleNativeFormCheckboxOption(
                      value,
                      option,
                      event.target.checked,
                    ),
                  )
                }
                className="accent-[#f7941d]"
              />
              <span className="break-words">{option}</span>
            </label>
          ))}
          {!options.length && (
            <p className="text-xs text-rose-600 dark:text-rose-300">
              No choices configured.
            </p>
          )}
        </div>
        {helpText}
      </fieldset>
    );
  }

  if (field.type === "radio") {
    return (
      <fieldset className={wrapperClass} onFocus={onFocus}>
        <legend>{heading}</legend>
        <div className="grid gap-2 rounded-md border border-[#d8d8d8] bg-white p-3 sm:grid-cols-2 dark:border-neutral-700 dark:bg-neutral-950">
          {options.map((option, optionIndex) => (
            <label
              key={`${option}-${optionIndex}`}
              className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200"
            >
              <input
                type="radio"
                name={fieldId}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="accent-[#f7941d]"
              />
              <span className="break-words">{option}</span>
            </label>
          ))}
          {!options.length && (
            <p className="text-xs text-rose-600 dark:text-rose-300">
              No choices configured.
            </p>
          )}
        </div>
        {helpText}
      </fieldset>
    );
  }

  if (field.type === "select") {
    return (
      <label className={wrapperClass} htmlFor={fieldId}>
        {heading}
        <select
          id={fieldId}
          value={value}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        >
          <option value="">{getNativeFormFieldPlaceholder(field)}</option>
          {options.map((option, optionIndex) => (
            <option key={`${option}-${optionIndex}`} value={option}>
              {option}
            </option>
          ))}
        </select>
        {helpText}
      </label>
    );
  }

  if (field.type === "long_text") {
    return (
      <label className={wrapperClass} htmlFor={fieldId}>
        {heading}
        <textarea
          id={fieldId}
          value={value}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
          placeholder={getNativeFormFieldPlaceholder(field)}
          rows={4}
          className={`${inputClass} py-2`}
        />
        {helpText}
      </label>
    );
  }

  const inputType =
    field.type === "date"
      ? "date"
      : field.type === "email"
        ? "email"
        : field.type === "number" || field.type === "currency"
          ? "number"
          : "text";

  return (
    <label className={wrapperClass} htmlFor={fieldId}>
      {heading}
      <input
        id={fieldId}
        type={inputType}
        step={field.type === "currency" ? "0.01" : undefined}
        inputMode={
          field.type === "number" || field.type === "currency"
            ? "decimal"
            : undefined
        }
        value={value}
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={getNativeFormFieldPlaceholder(field)}
        className={inputClass}
      />
      {helpText}
    </label>
  );
}
