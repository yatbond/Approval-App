import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addBusiness,
  addDepartment,
  deleteBusiness,
  deleteDepartment,
  seededBusinessDirectory,
  updateBusiness,
  updateDepartment,
} from "./business-directory.ts";

test("seeds the requested businesses in display order", () => {
  assert.deepEqual(
    seededBusinessDirectory.map((business) => business.name),
    [
      "Asia Allied Infrastructure",
      "AMAIN",
      "Chun Wo Bus",
      "Hong Kong Cyclotron",
      "Kwan Lee",
      "Manbond",
      "Mattex",
      "City Service Group",
      "Chun Wo Property",
      "Vision Foundations",
      "Allalign",
      "HyPath",
      "See Change Education",
      "Chun Wo Construction",
    ],
  );
});

test("seeds departments for Asia Allied Infrastructure", () => {
  const asia = seededBusinessDirectory.find(
    (business) => business.name === "Asia Allied Infrastructure",
  );

  assert.deepEqual(asia?.departments, [
    "Administration",
    "Company Secretary",
    "Contracts & Legal",
    "Corporate Communications",
    "Finance",
    "Human Resources",
    "Information & Technology",
    "Internal Control & Process",
  ]);
});

test("seeds departments for Chun Wo Construction", () => {
  const construction = seededBusinessDirectory.find(
    (business) => business.name === "Chun Wo Construction",
  );

  assert.deepEqual(construction?.departments, [
    "Construction Finance",
    "BIM",
    "Claims & Dispute Resolution",
    "Commercial",
    "Compliance",
    "Human Resources",
    "Technical",
    "Maintenance",
    "Tendering",
  ]);
});

test("adds, updates, and deletes businesses without mutating original state", () => {
  const added = addBusiness(seededBusinessDirectory, "New Business");
  const newBusiness = added.at(-1);

  assert.equal(seededBusinessDirectory.some((business) => business.name === "New Business"), false);
  assert.equal(newBusiness?.name, "New Business");
  assert.deepEqual(newBusiness?.departments, []);

  const updated = updateBusiness(added, newBusiness.id, "Renamed Business");
  assert.equal(updated.at(-1)?.name, "Renamed Business");

  const deleted = deleteBusiness(updated, newBusiness.id);
  assert.equal(deleted.some((business) => business.id === newBusiness.id), false);
});

test("adds, updates, and deletes departments for a business", () => {
  const businessId = seededBusinessDirectory[1].id;
  const added = addDepartment(seededBusinessDirectory, businessId, "Accounting");
  assert.deepEqual(
    added.find((business) => business.id === businessId)?.departments,
    ["Accounting"],
  );

  const updated = updateDepartment(added, businessId, 0, "Group Accounting");
  assert.deepEqual(
    updated.find((business) => business.id === businessId)?.departments,
    ["Group Accounting"],
  );

  const deleted = deleteDepartment(updated, businessId, 0);
  assert.deepEqual(
    deleted.find((business) => business.id === businessId)?.departments,
    [],
  );
});
