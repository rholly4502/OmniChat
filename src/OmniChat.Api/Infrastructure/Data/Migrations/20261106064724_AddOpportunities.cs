using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniChat.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOpportunities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Opportunities",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Judul = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Perusahaan = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Lokasi = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Tipe = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Gaji = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    Link = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    Catatan = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    Ditemukan = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    SourceId = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Opportunities", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Opportunities_SourceId",
                table: "Opportunities",
                column: "SourceId");

            migrationBuilder.CreateIndex(
                name: "IX_Opportunities_Status",
                table: "Opportunities",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Opportunities");
        }
    }
}
