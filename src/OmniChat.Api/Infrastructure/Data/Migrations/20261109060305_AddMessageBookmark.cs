using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniChat.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMessageBookmark : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsBookmarked",
                table: "Messages",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsBookmarked",
                table: "Messages");
        }
    }
}
