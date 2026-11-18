using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniChat.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOpportunityStageDates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "DilamarPada",
                table: "Opportunities",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "InterviewPada",
                table: "Opportunities",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "TawaranPada",
                table: "Opportunities",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DilamarPada",
                table: "Opportunities");

            migrationBuilder.DropColumn(
                name: "InterviewPada",
                table: "Opportunities");

            migrationBuilder.DropColumn(
                name: "TawaranPada",
                table: "Opportunities");
        }
    }
}
