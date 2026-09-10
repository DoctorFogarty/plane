/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { Loader } from "@plane/ui";

interface TableSkeletonProps {
  columns: ColumnDef<any>[];
  rows: number;
}

export function TableLoader({ columns, rows }: TableSkeletonProps) {
  const columnKeys = columns.map(
    (column, columnIndex) => column.id ?? column.header?.toString() ?? `skeleton-header-${columnIndex}`
  );
  const rowKeys = Array.from({ length: rows }, (_, rowIndex) => `skeleton-row-${rowIndex}`);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column, columnIndex) => {
            const columnKey = columnKeys[columnIndex];
            return <TableHead key={columnKey}>{typeof column.header === "string" ? column.header : ""}</TableHead>;
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rowKeys.map((rowKey) => (
          <TableRow key={rowKey}>
            {columnKeys.map((columnKey) => (
              <TableCell key={`${rowKey}-${columnKey}`}>
                <Loader.Item height="20px" width="100%" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
