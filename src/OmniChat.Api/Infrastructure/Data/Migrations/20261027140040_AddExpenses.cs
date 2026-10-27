using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniChat.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddExpenses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Expenses",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Tanggal = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Waktu = table.Column<string>(type: "TEXT", maxLength: 8, nullable: false),
                    Kategori = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Keterangan = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Nominal = table.Column<long>(type: "INTEGER", nullable: false),
                    SourceId = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Expenses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ExpenseTargets",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Month = table.Column<string>(type: "TEXT", maxLength: 7, nullable: false),
                    TargetNabung = table.Column<long>(type: "INTEGER", nullable: false),
                    Anggaran = table.Column<long>(type: "INTEGER", nullable: false),
                    Catatan = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpenseTargets", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Expenses_SourceId",
                table: "Expenses",
                column: "SourceId");

            migrationBuilder.CreateIndex(
                name: "IX_Expenses_Tanggal_Id",
                table: "Expenses",
                columns: new[] { "Tanggal", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_ExpenseTargets_Month",
                table: "ExpenseTargets",
                column: "Month",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Expenses");

            migrationBuilder.DropTable(
                name: "ExpenseTargets");
        }
    }
}
