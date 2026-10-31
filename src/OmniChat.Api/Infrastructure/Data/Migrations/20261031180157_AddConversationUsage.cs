using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniChat.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddConversationUsage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CompletionTokens",
                table: "Conversations",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "PromptTokens",
                table: "Conversations",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CompletionTokens",
                table: "Conversations");

            migrationBuilder.DropColumn(
                name: "PromptTokens",
                table: "Conversations");
        }
    }
}
