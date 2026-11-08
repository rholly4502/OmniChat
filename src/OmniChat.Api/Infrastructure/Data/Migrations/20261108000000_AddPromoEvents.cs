using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniChat.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPromoEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PromoEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Aplikasi = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Judul = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Benefit = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    Syarat = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    Link = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    BerlakuSampai = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    Ditemukan = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    SourceId = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PromoEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PromoEvents_SourceId",
                table: "PromoEvents",
                column: "SourceId");

            migrationBuilder.CreateIndex(
                name: "IX_PromoEvents_Aplikasi",
                table: "PromoEvents",
                column: "Aplikasi");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PromoEvents");
        }
    }
}
